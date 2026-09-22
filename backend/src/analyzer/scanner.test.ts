import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaultScanLimits, scanProject } from './scanner.js';

test('scanner collects text and structure while ignoring generated, private, and binary files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scanner-'));
  try {
    for (const directory of ['src', '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', 'out', 'target', 'vendor']) {
      mkdirSync(join(root, directory));
      if (directory !== 'src') writeFileSync(join(root, directory, 'hidden.ts'), 'ignored');
    }
    writeFileSync(join(root, 'src', 'main.ts'), 'export function start() {}');
    writeFileSync(join(root, 'README.md'), '# Demo');
    writeFileSync(join(root, 'ProjectMap.json'), '{"generated":true}');
    writeFileSync(join(root, 'package-lock.json'), '{"large":"dependency metadata"}');
    writeFileSync(join(root, '.env'), 'OPENAI_API_KEY=secret');
    writeFileSync(join(root, 'image.bin'), Buffer.from([0, 1, 2, 3]));

    const result = await scanProject(root);
    assert.deepEqual(result.directories, ['src']);
    assert.deepEqual(result.files.map((file) => file.path).sort(), ['README.md', 'src/main.ts']);
    assert.equal(result.files.find((file) => file.path === 'src/main.ts')?.content, 'export function start() {}');
    assert.equal(result.truncated, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scanner enforces per-file, total-byte, file-count, and entry limits', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scanner-limits-'));
  try {
    writeFileSync(join(root, 'a.txt'), 'abcdefghij');
    writeFileSync(join(root, 'b.txt'), 'klmnopqrst');
    writeFileSync(join(root, 'c.txt'), 'uvwxyz');

    const limited = await scanProject(root, {
      ...defaultScanLimits, maxFileBytes: 5, maxTotalBytes: 7,
    });
    assert.deepEqual(limited.files.map((file) => file.content), ['abcde', 'kl']);
    assert.deepEqual(limited.files.map((file) => file.truncated), [true, true]);
    assert.equal(limited.truncated, true);

    const fileLimited = await scanProject(root, { ...defaultScanLimits, maxFiles: 1 });
    assert.equal(fileLimited.files.length, 1);
    assert.equal(fileLimited.truncated, true);

    const entryLimited = await scanProject(root, { ...defaultScanLimits, maxEntries: 1 });
    assert.equal(entryLimited.files.length, 1);
    assert.equal(entryLimited.truncated, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scanner shares a constrained budget across top-level areas deterministically', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scanner-fair-'));
  try {
    for (const directory of ['alpha', 'beta', 'gamma']) {
      mkdirSync(join(root, directory));
      writeFileSync(join(root, directory, 'package.json'), `{"name":"${directory}"}`);
      for (let index = 0; index < 10; index++) {
        writeFileSync(join(root, directory, `feature-${index}.ts`), 'x'.repeat(20));
      }
    }
    writeFileSync(join(root, 'README.md'), '# Architecture');
    writeFileSync(join(root, '.gitmodules'), '[submodule "example"]');
    const limits = { ...defaultScanLimits, maxTotalBytes: 100, maxFileBytes: 20 };
    const first = await scanProject(root, limits);
    const second = await scanProject(root, limits);
    assert.deepEqual(first, second);
    for (const area of ['alpha', 'beta', 'gamma']) {
      assert.ok(first.files.some((file) => file.path.startsWith(`${area}/`)), area);
    }
    assert.ok(first.files.some((file) => file.path === 'README.md'));
    assert.ok(first.files.some((file) => file.path === '.gitmodules'));
    assert.ok(first.files.every((file) => Buffer.byteLength(file.content) <= 20));
    assert.ok(first.files.reduce((total, file) => total + Buffer.byteLength(file.content), 0) <= 100);
    assert.equal(first.truncated, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fair selection retains file, entry, depth, symlink, and exclusion limits', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scanner-fair-limits-'));
  try {
    for (const area of ['a', 'b']) {
      mkdirSync(join(root, area));
      mkdirSync(join(root, area, 'nested'));
      writeFileSync(join(root, area, 'one.ts'), 'code');
      writeFileSync(join(root, area, 'nested', 'deep.ts'), 'deep');
      writeFileSync(join(root, area, '.env'), 'secret');
      writeFileSync(join(root, area, 'ProjectMap.json'), '{}');
      writeFileSync(join(root, area, 'binary.bin'), Buffer.from([0, 1, 2]));
      symlinkSync(join(root, area, 'one.ts'), join(root, area, 'linked.ts'));
    }
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, '.git', 'hidden.ts'), 'hidden');
    writeFileSync(join(root, 'node_modules', 'hidden.ts'), 'hidden');

    const result = await scanProject(root);
    assert.deepEqual(result.files.map((file) => file.path).sort(), [
      'a/nested/deep.ts', 'a/one.ts', 'b/nested/deep.ts', 'b/one.ts',
    ]);
    assert.equal(result.truncated, false);

    const fileLimited = await scanProject(root, { ...defaultScanLimits, maxFiles: 2 });
    assert.equal(fileLimited.files.length, 2);
    assert.ok(fileLimited.files.some((file) => file.path.startsWith('a/')));
    assert.ok(fileLimited.files.some((file) => file.path.startsWith('b/')));
    assert.equal(fileLimited.truncated, true);

    const depthLimited = await scanProject(root, { ...defaultScanLimits, maxDepth: 1 });
    assert.deepEqual(depthLimited.files.map((file) => file.path).sort(), ['a/one.ts', 'b/one.ts']);
    assert.equal(depthLimited.truncated, true);

    const entryLimited = await scanProject(root, { ...defaultScanLimits, maxEntries: 2 });
    assert.equal(entryLimited.truncated, true);
    assert.ok(entryLimited.files.length <= 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('architecture sampling balances areas and bounds protocol, domain, and API priority', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scanner-architecture-'));
  try {
    const files = [
      'large/package.json', 'large/src/app.ts',
      'large/src/api/ws/ws.ts', 'large/src/api/ws/ws-one.ts', 'large/src/api/ws/ws-two.ts',
      'large/src/domain/orders/services/OrderService.ts',
      'large/src/domain/orders/services/OtherService.ts',
      'large/src/api/rest/handlers/createOrder.ts', 'large/src/api/rest/handlers/getOrder.ts',
      'large/src/core.ts',
      'sibling/package.json', 'sibling/src/main.ts',
    ];
    for (const path of files) {
      const destination = join(root, path);
      mkdirSync(join(destination, '..'), { recursive: true });
      writeFileSync(destination, 'x'.repeat(10));
    }
    writeFileSync(join(root, 'large', 'tsconfig.json'), 'x'.repeat(200));
    mkdirSync(join(root, 'large', 'tests'));
    writeFileSync(join(root, 'large', 'tests', 'check.ts'), 'x'.repeat(10));

    const limits = { ...defaultScanLimits, maxTotalBytes: 120, maxFileBytes: 20 };
    const first = await scanProject(root, limits);
    assert.deepEqual(first, await scanProject(root, limits));
    assert.deepEqual(first.files.map((file) => file.path).sort(), files.sort());
    assert.equal(first.files.reduce((total, file) => total + Buffer.byteLength(file.content), 0), 120);
    assert.equal(first.truncated, true);
    assert.equal(first.files.filter((file) => file.path.includes('/ws/')).length, 3);
    assert.equal(first.files.filter((file) => file.path.includes('/domain/')).length, 2);
    assert.equal(first.files.filter((file) => file.path.includes('/handlers/')).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
