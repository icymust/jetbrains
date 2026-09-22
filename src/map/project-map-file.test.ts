import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readProjectMap, saveProjectMap, type ProjectMap } from './project-map-file.js';

test('ProjectMap file is replaced and read without temporary files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'project-map-'));
  const first: ProjectMap = {
    project_id: 'demo', generated_at: '2026-09-22T00:00:00.000Z',
    nodes: [{ id: 'backend', name: 'Backend', type: 'service' }], relations: [],
  };
  try {
    assert.equal(await readProjectMap(root), null);
    await saveProjectMap(root, first);
    assert.deepEqual(await readProjectMap(root), first);
    const second: ProjectMap = { ...first, generated_at: '2026-09-22T01:00:00.000Z' };
    await saveProjectMap(root, second);
    assert.deepEqual(await readProjectMap(root), second);
    assert.deepEqual(readdirSync(root), ['ProjectMap.json']);

    writeFileSync(join(root, 'ProjectMap.json'), '{"nodes":[]}');
    await assert.rejects(readProjectMap(root), /Invalid project map/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
