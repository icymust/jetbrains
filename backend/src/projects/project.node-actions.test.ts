import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { GraphRequester } from '../ai/openai-analyzer.js';
import type { AuditRequester } from '../ai/openai-auditor.js';
import { openDatabase } from '../db/db.js';
import { saveProjectMap } from '../map/project-map-file.js';
import { registerProjectRoutes } from './project.routes.js';

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'project-node-actions-'));
  const repository = join(root, 'repository');
  mkdirSync(join(repository, 'src'), { recursive: true });
  execFileSync('git', ['init', '-q', repository]);
  writeFileSync(join(repository, 'src/server.ts'), 'export const server = "real service code";');
  writeFileSync(join(repository, 'src/login.ts'), 'export function login() { return "real feature code"; }');
  let graphCalls = 0;
  let auditCalls = 0;
  let auditInput = '';
  let auditOutput: unknown = {
    overall_score: 81,
    optimization_score: 76,
    maintainability_score: 85,
    improvements: [
      { title: 'Separate transport code', description: 'Move route wiring behind a small boundary.' },
      { title: 'Add explicit errors', description: 'Represent expected failures with typed results.' },
    ],
  };
  const graphRequester: GraphRequester = {
    async request() {
      graphCalls++;
      throw new Error('Graph analyzer must not run');
    },
  };
  const auditRequester: AuditRequester = {
    async request(input) {
      auditCalls++;
      auditInput = input;
      return JSON.stringify(auditOutput);
    },
  };
  const database = openDatabase(join(root, 'projects.sqlite'));
  const app = Fastify();
  registerProjectRoutes(app, database, graphRequester, undefined, auditRequester);
  app.addHook('onClose', async () => database.close());
  const created = await app.inject({
    method: 'POST', url: '/projects', payload: { name: 'Demo', path: repository },
  });
  const projectId = created.json().id as string;
  await saveProjectMap(repository, {
    project_id: projectId,
    generated_at: '2026-09-22T00:00:00.000Z',
    nodes: [
      { id: 'service', name: 'Backend Service', type: 'service' },
      { id: 'login', name: 'Login', type: 'feature' },
    ],
    relations: [{ parent_id: 'service', child_id: 'login', label: 'contains' }],
    evidence_paths_by_node: {
      service: ['src/server.ts'],
      login: ['src/login.ts'],
    },
  });
  return {
    root, repository, app, projectId,
    graphCalls: () => graphCalls,
    auditCalls: () => auditCalls,
    auditInput: () => auditInput,
    setAuditOutput: (value: unknown) => { auditOutput = value; },
  };
}

test('context returns real map and evidence data without invoking AI', async () => {
  const setup = await fixture();
  try {
    const response = await setup.app.inject({
      method: 'GET', url: `/projects/${setup.projectId}/nodes/service/context`,
    });
    assert.equal(response.statusCode, 200);
    const context = response.json();
    assert.equal(context.node_name, 'Backend Service');
    assert.equal(context.node_type, 'service');
    assert.deepEqual(context.features, [{ id: 'login', name: 'Login', type: 'feature' }]);
    assert.deepEqual(context.relations, [{ parent_id: 'service', child_id: 'login', label: 'contains' }]);
    assert.deepEqual(context.evidence_paths, ['src/server.ts', 'src/login.ts']);
    assert.match(context.context, /real service code/);
    assert.match(context.context, /real feature code/);
    assert.equal(context.evidence_files, undefined);
    assert.equal(setup.graphCalls(), 0);
    assert.equal(setup.auditCalls(), 0);
  } finally {
    await setup.app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('test results are deterministic, passing, and stay within demo ranges', async () => {
  const setup = await fixture();
  try {
    const url = `/projects/${setup.projectId}/nodes/login/tests`;
    const first = (await setup.app.inject({ method: 'GET', url })).json();
    const second = (await setup.app.inject({ method: 'GET', url })).json();
    assert.deepEqual(first, second);
    assert.ok(first.total >= 3 && first.total <= 10);
    assert.equal(first.passed, first.total);
    assert.equal(first.failed, 0);
    assert.ok(first.duration >= 0.5 && first.duration <= 1.5);
    assert.equal(setup.graphCalls(), 0);
    assert.equal(setup.auditCalls(), 0);
  } finally {
    await setup.app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('explain returns a prepared node-specific prompt without invoking AI', async () => {
  const setup = await fixture();
  try {
    const response = await setup.app.inject({
      method: 'GET', url: `/projects/${setup.projectId}/nodes/login/explain`,
    });
    assert.deepEqual(response.json(), {
      node_id: 'login',
      node_name: 'Login',
      prompt: 'Explain how Login works, including its main responsibilities, features, and connections to other services.',
    });
    assert.equal(setup.graphCalls(), 0);
    assert.equal(setup.auditCalls(), 0);
  } finally {
    await setup.app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('audit invokes only its requester, sends selected evidence, and validates output', async () => {
  const setup = await fixture();
  try {
    const url = `/projects/${setup.projectId}/nodes/login/audit`;
    const response = await setup.app.inject({ method: 'POST', url });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      node_id: 'login', node_name: 'Login',
      overall_score: 81, optimization_score: 76, maintainability_score: 85,
      improvements: [
        { title: 'Separate transport code', description: 'Move route wiring behind a small boundary.' },
        { title: 'Add explicit errors', description: 'Represent expected failures with typed results.' },
      ],
    });
    const input = JSON.parse(setup.auditInput());
    assert.deepEqual(input.evidence_files.map((file: { path: string }) => file.path), ['src/login.ts']);
    assert.match(input.evidence_files[0].content, /real feature code/);
    assert.equal(setup.graphCalls(), 0);
    assert.equal(setup.auditCalls(), 1);

    setup.setAuditOutput({
      overall_score: 101, optimization_score: 76, maintainability_score: 85,
      improvements: [{ title: 'Only one', description: 'Invalid.' }],
    });
    const invalid = await setup.app.inject({ method: 'POST', url });
    assert.equal(invalid.statusCode, 500);
    assert.deepEqual(invalid.json(), { error: 'Node audit failed' });
    assert.equal(setup.auditCalls(), 2);
  } finally {
    await setup.app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('node actions handle unknown projects, maps, nodes, and missing evidence', async () => {
  const setup = await fixture();
  try {
    assert.equal((await setup.app.inject({ method: 'GET', url: '/projects/unknown/nodes/login/context' })).statusCode, 404);
    assert.equal((await setup.app.inject({
      method: 'GET', url: `/projects/${setup.projectId}/nodes/unknown/context`,
    })).statusCode, 404);

    const emptyRepository = join(setup.root, 'without-map');
    mkdirSync(emptyRepository);
    execFileSync('git', ['init', '-q', emptyRepository]);
    const withoutMap = await setup.app.inject({
      method: 'POST', url: '/projects', payload: { name: 'Without map', path: emptyRepository },
    });
    const noMap = await setup.app.inject({
      method: 'GET', url: `/projects/${withoutMap.json().id}/nodes/anything/context`,
    });
    assert.equal(noMap.statusCode, 404);
    assert.deepEqual(noMap.json(), { error: 'Project map not loaded' });

    rmSync(join(setup.repository, 'src/login.ts'));
    const context = await setup.app.inject({
      method: 'GET', url: `/projects/${setup.projectId}/nodes/login/context`,
    });
    assert.equal(context.statusCode, 200);
    assert.deepEqual(context.json().missing_evidence_paths, ['src/login.ts']);
    const audit = await setup.app.inject({
      method: 'POST', url: `/projects/${setup.projectId}/nodes/login/audit`,
    });
    assert.equal(audit.statusCode, 409);
    assert.equal(setup.auditCalls(), 0);
  } finally {
    await setup.app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('node context rejects evidence paths that escape through a symlink', async () => {
  const setup = await fixture();
  try {
    const outside = join(setup.root, 'outside.ts');
    writeFileSync(outside, 'secret');
    symlinkSync(outside, join(setup.repository, 'src/escape.ts'));
    await saveProjectMap(setup.repository, {
      project_id: setup.projectId,
      generated_at: '2026-09-22T00:00:00.000Z',
      nodes: [{ id: 'service', name: 'Backend Service', type: 'service' }],
      relations: [],
      evidence_paths_by_node: { service: ['src/escape.ts'] },
    });
    const response = await setup.app.inject({
      method: 'GET', url: `/projects/${setup.projectId}/nodes/service/context`,
    });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: 'Project map contains an unsafe evidence path' });
    assert.equal(response.body.includes('secret'), false);
  } finally {
    await setup.app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});
