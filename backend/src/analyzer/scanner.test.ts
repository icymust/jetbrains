import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
