import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { GraphRequester } from '../ai/openai-analyzer.js';
import { scanProject } from '../analyzer/scanner.js';
import { openDatabase } from '../db/db.js';
import { registerProjectRoutes } from './project.routes.js';

test('load saves a labeled map, nodes reads it, and failed reload preserves it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'project-load-'));
  const repository = join(root, 'repository');
  mkdirSync(repository);
  execFileSync('git', ['init', '-q', repository]);
  writeFileSync(join(repository, 'package.json'), '{"name":"demo"}');
  writeFileSync(join(repository, 'server.ts'), 'export function login() {}');

  let failure: 'none' | 'api' | 'validation' = 'none';
  let requestCount = 0;
  let waitBeforeReply: Promise<void> | undefined;
  let signalEntered: (() => void) | undefined;
  const requester: GraphRequester = {
    async request(input) {
      requestCount++;
      signalEntered?.();
      if (waitBeforeReply) await waitBeforeReply;
      const files = JSON.parse(input).files as Array<{ path: string }>;
      assert.equal(files.some((file) => file.path === 'ProjectMap.json'), false);
      if (failure === 'api') throw new Error('Mock OpenAI failure');
      if (failure === 'validation') return JSON.stringify({ nodes: [], relations: [] });
      return JSON.stringify({
        nodes: [
          { id: 'backend', name: 'Backend', type: 'service', evidence_paths: ['package.json'] },
          { id: 'auth', name: 'Authentication', type: 'feature', evidence_paths: ['server.ts'] },
        ],
        relations: [{ parent_id: 'backend', child_id: 'auth', label: 'contains' }],
      });
    },
  };
  const database = openDatabase(join(root, 'projects.sqlite'));
  const app = Fastify();
  registerProjectRoutes(app, database, requester);
  app.addHook('onClose', async () => database.close());

  try {
    const created = await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Demo', path: repository } });
    assert.equal(created.statusCode, 201);
    const projectId = created.json().id as string;
    const nodesUrl = `/projects/${projectId}/nodes`;
    assert.equal((await app.inject({ method: 'GET', url: nodesUrl })).statusCode, 404);

    const loaded = await app.inject({ method: 'POST', url: `/projects/${projectId}/load` });
    assert.equal(loaded.statusCode, 200);
    const graph = loaded.json();
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.relations[0].label, 'contains');
    assert.deepEqual((await app.inject({ method: 'GET', url: nodesUrl })).json(), graph);

    const mapFile = join(repository, 'ProjectMap.json');
    let saved = readFileSync(mapFile, 'utf8');
    const map = JSON.parse(saved);
    assert.equal(map.project_id, projectId);
    assert.equal(typeof map.generated_at, 'string');
    assert.deepEqual(map.nodes, graph.nodes);
    assert.deepEqual(map.relations, graph.relations);
    assert.equal(JSON.stringify(map).includes('evidence_paths'), false);
    assert.equal((await scanProject(repository)).files.some((file) => file.path === 'ProjectMap.json'), false);

    writeFileSync(join(repository, 'server.ts'), 'export function login() { return true; }');
    execFileSync('git', ['add', 'server.ts'], { cwd: repository });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'first'], { cwd: repository });
    const firstCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
    let updatedMap = JSON.parse(readFileSync(mapFile, 'utf8'));
    for (let attempt = 0; attempt < 40 && updatedMap.commit !== firstCommit; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      updatedMap = JSON.parse(readFileSync(mapFile, 'utf8'));
    }
    assert.equal(updatedMap.commit, firstCommit);
    assert.ok(requestCount >= 2);

    let releaseAnalysis!: () => void;
    waitBeforeReply = new Promise<void>((resolve) => { releaseAnalysis = resolve; });
    const entered = new Promise<void>((resolve) => { signalEntered = resolve; });
    const ongoing = app.inject({ method: 'POST', url: `/projects/${projectId}/load` });
    await entered;
    assert.equal((await app.inject({ method: 'POST', url: `/projects/${projectId}/load` })).statusCode, 409);
    releaseAnalysis();
    assert.equal((await ongoing).statusCode, 200);
    waitBeforeReply = undefined;
    signalEntered = undefined;
    saved = readFileSync(mapFile, 'utf8');

    failure = 'api';
    assert.equal((await app.inject({ method: 'POST', url: `/projects/${projectId}/load` })).statusCode, 500);
    assert.equal(readFileSync(mapFile, 'utf8'), saved);
    assert.deepEqual((await app.inject({ method: 'GET', url: nodesUrl })).json(), graph);

    failure = 'validation';
    assert.equal((await app.inject({ method: 'POST', url: `/projects/${projectId}/load` })).statusCode, 500);
    assert.equal(readFileSync(mapFile, 'utf8'), saved);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
