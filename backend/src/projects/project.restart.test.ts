import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { GraphRequester } from '../ai/openai-analyzer.js';
import { openDatabase } from '../db/db.js';
import { readProjectMap, saveProjectMap } from '../map/project-map-file.js';
import { registerProjectRoutes } from './project.routes.js';

test('restart restores saved maps, refreshes an outdated map, and leaves an unmapped project idle', async () => {
  const root = mkdtempSync(join(tmpdir(), 'project-restart-'));
  const databasePath = join(root, 'projects.sqlite');
  const repositories = ['current', 'behind', 'unmapped'].map((name) => join(root, name));
  const commits = repositories.map((repository) => {
    mkdirSync(repository);
    execFileSync('git', ['init', '-q', repository]);
    writeFileSync(join(repository, 'server.ts'), 'export function feature() {}');
    execFileSync('git', ['add', 'server.ts'], { cwd: repository });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'initial'], { cwd: repository });
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
  });
  const requests: string[] = [];
  const requester: GraphRequester = {
    async request(input) {
      requests.push(input);
      return JSON.stringify({
        nodes: [{ id: 'service', name: 'Service', type: 'service', evidence_paths: ['server.ts'] }],
        relations: [],
      });
    },
  };
  function startApp() {
    const database = openDatabase(databasePath);
    const app = Fastify();
    registerProjectRoutes(app, database, requester);
    app.addHook('onClose', async () => database.close());
    return app;
  }
  let app = startApp();
  try {
    const ids: string[] = [];
    for (let index = 0; index < repositories.length; index++) {
      const response = await app.inject({
        method: 'POST', url: '/projects', payload: { name: `Project ${index}`, path: repositories[index] },
      });
      assert.equal(response.statusCode, 201);
      ids.push(response.json().id);
    }
    await app.close();

    for (let index = 0; index < 2; index++) {
      await saveProjectMap(repositories[index]!, {
        project_id: ids[index]!, commit: commits[index]!, generated_at: new Date().toISOString(),
        nodes: [{ id: 'service', name: 'Service', type: 'service' }], relations: [],
      });
    }
    writeFileSync(join(repositories[1]!, 'server.ts'), 'export function feature() { return true; }');
    execFileSync('git', ['add', 'server.ts'], { cwd: repositories[1] });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'update'], { cwd: repositories[1] });
    const newCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositories[1], encoding: 'utf8' }).trim();

    app = startApp();
    await app.ready();
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await readProjectMap(repositories[1]!))?.commit === newCommit) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal((await readProjectMap(repositories[1]!))?.commit, newCommit);
    assert.equal(requests.length, 1);
    assert.equal((await readProjectMap(repositories[0]!))?.commit, commits[0]);
    assert.equal(await readProjectMap(repositories[2]!), null);
    assert.equal((await app.inject({ method: 'GET', url: `/projects/${ids[0]}/nodes` })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: `/projects/${ids[2]}/nodes` })).statusCode, 404);

    writeFileSync(join(repositories[0]!, 'server.ts'), 'export function feature() { return 2; }');
    execFileSync('git', ['add', 'server.ts'], { cwd: repositories[0] });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'update'], { cwd: repositories[0] });
    const currentNewCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositories[0], encoding: 'utf8' }).trim();
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await readProjectMap(repositories[0]!))?.commit === currentNewCommit) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal((await readProjectMap(repositories[0]!))?.commit, currentNewCommit);
    assert.equal(requests.length, 2);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
