import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { CustomActionRequester } from '../ai/openai-custom-action.js';
import { openDatabase } from '../db/db.js';
import { saveProjectMap } from '../map/project-map-file.js';
import { registerCustomActionRoutes } from './custom-action.routes.js';

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'custom-actions-'));
  const databasePath = join(root, 'projects.sqlite');
  const repositories = [join(root, 'project-one'), join(root, 'project-two')];
  for (const repository of repositories) {
    mkdirSync(join(repository, 'src'), { recursive: true });
    writeFileSync(join(repository, 'src/service.ts'), 'export const service = "real service evidence";');
    writeFileSync(join(repository, 'src/feature.ts'), 'export const feature = "real feature evidence";');
    writeFileSync(join(repository, 'src/other.ts'), 'export const other = true;');
  }
  const projectIds = ['project-one', 'project-two'];
  let aiCalls = 0;
  const aiInputs: string[] = [];
  let aiOutput = 'Custom action result';
  let aiFailure = false;
  const requester: CustomActionRequester = {
    async request(input) {
      aiCalls++;
      aiInputs.push(input);
      if (aiFailure) throw new Error('private provider failure');
      return aiOutput;
    },
  };

  async function writeMap(index: number, includeEvidence = true) {
    await saveProjectMap(repositories[index]!, {
      project_id: projectIds[index]!, generated_at: new Date().toISOString(),
      nodes: [
        { id: 'service-a', name: 'Order Service', type: 'service' },
        { id: 'feature-a', name: 'Order Management', type: 'feature' },
        { id: 'service-b', name: 'Billing Service', type: 'service' },
      ],
      relations: [
        { parent_id: 'service-a', child_id: 'feature-a', label: 'contains' },
        { parent_id: 'service-a', child_id: 'service-b', label: 'HTTP' },
      ],
      evidence_paths_by_node: includeEvidence ? {
        'service-a': ['src/service.ts'],
        'feature-a': ['src/feature.ts'],
        'service-b': ['src/other.ts'],
      } : undefined,
    });
  }
  await writeMap(0);
  await writeMap(1);

  function startApp() {
    const database = openDatabase(databasePath);
    for (let index = 0; index < projectIds.length; index++) {
      database.prepare('INSERT OR IGNORE INTO projects (id, name, path) VALUES (?, ?, ?)')
        .run(projectIds[index], `Project ${index + 1}`, repositories[index]);
    }
    const app = Fastify();
    registerCustomActionRoutes(app, database, requester);
    app.addHook('onClose', async () => database.close());
    return app;
  }

  return {
    root, repositories, projectIds, startApp, writeMap,
    aiCalls: () => aiCalls,
    aiInputs,
    setAiOutput(value: string) { aiOutput = value; },
    setAiFailure(value: boolean) { aiFailure = value; },
  };
}

const actionPayload = {
  name: 'Generate Docs',
  icon: 'document',
  prompt: 'Generate concise documentation for this service.',
};

test('custom actions persist and remain isolated by project and service across map regeneration', async () => {
  const setup = await fixture();
  let app = setup.startApp();
  try {
    const base = `/projects/${setup.projectIds[0]}/nodes`;
    const created = await app.inject({
      method: 'POST', url: `${base}/service-a/actions`, payload: actionPayload,
    });
    assert.equal(created.statusCode, 201);
    const action = created.json();
    assert.equal(typeof action.id, 'string');
    assert.deepEqual({ name: action.name, icon: action.icon, prompt: action.prompt }, actionPayload);
    assert.equal(setup.aiCalls(), 0);

    assert.deepEqual((await app.inject({ method: 'GET', url: `${base}/service-a/actions` })).json(), {
      actions: [action],
    });
    assert.deepEqual((await app.inject({ method: 'GET', url: `${base}/service-b/actions` })).json(), {
      actions: [],
    });
    assert.deepEqual((await app.inject({
      method: 'GET', url: `/projects/${setup.projectIds[1]}/nodes/service-a/actions`,
    })).json(), { actions: [] });
    assert.equal(setup.aiCalls(), 0);

    await saveProjectMap(setup.repositories[0]!, {
      project_id: setup.projectIds[0]!, generated_at: new Date().toISOString(),
      nodes: [{ id: 'service-b', name: 'Billing Service', type: 'service' }], relations: [],
      evidence_paths_by_node: { 'service-b': ['src/other.ts'] },
    });
    assert.equal((await app.inject({ method: 'GET', url: `${base}/service-a/actions` })).statusCode, 404);
    await setup.writeMap(0);
    await app.close();
    app = setup.startApp();
    const afterRestart = await app.inject({ method: 'GET', url: `${base}/service-a/actions` });
    assert.deepEqual(afterRestart.json(), { actions: [action] });
    assert.equal(setup.aiCalls(), 0);
  } finally {
    await app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('creation accepts services only and rejects blank or oversized fields without AI', async () => {
  const setup = await fixture();
  const app = setup.startApp();
  try {
    const base = `/projects/${setup.projectIds[0]}/nodes`;
    const feature = await app.inject({
      method: 'POST', url: `${base}/feature-a/actions`, payload: actionPayload,
    });
    assert.equal(feature.statusCode, 400);
    assert.deepEqual(feature.json(), { error: 'Custom actions are only supported for service nodes' });

    for (const field of ['name', 'icon', 'prompt'] as const) {
      const invalid = await app.inject({
        method: 'POST', url: `${base}/service-a/actions`,
        payload: { ...actionPayload, [field]: '   ' },
      });
      assert.equal(invalid.statusCode, 400, field);
      assert.deepEqual(invalid.json(), { error: `Action ${field} must not be blank` });
    }
    const tooLong = await app.inject({
      method: 'POST', url: `${base}/service-a/actions`,
      payload: { ...actionPayload, prompt: 'x'.repeat(4001) },
    });
    assert.equal(tooLong.statusCode, 400);
    assert.equal(setup.aiCalls(), 0);
  } finally {
    await app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('execution uses saved action, optional instructions, and real bounded service context', async () => {
  const setup = await fixture();
  const app = setup.startApp();
  try {
    const base = `/projects/${setup.projectIds[0]}/nodes/service-a/actions`;
    const action = (await app.inject({ method: 'POST', url: base, payload: actionPayload })).json();
    assert.equal(setup.aiCalls(), 0);

    const withInstructions = await app.inject({
      method: 'POST', url: `${base}/${action.id}/execute`,
      payload: { additional_instructions: 'Focus on the public API.' },
    });
    assert.equal(withInstructions.statusCode, 200);
    assert.deepEqual(withInstructions.json(), {
      action_id: action.id,
      action_name: actionPayload.name,
      node_id: 'service-a',
      node_name: 'Order Service',
      status: 'done',
      output: 'Custom action result',
    });
    assert.equal(setup.aiCalls(), 1);
    const firstInput = JSON.parse(setup.aiInputs[0]!);
    assert.deepEqual(firstInput.action, { name: actionPayload.name, prompt: actionPayload.prompt });
    assert.equal(firstInput.additional_instructions, 'Focus on the public API.');
    assert.deepEqual(firstInput.service, { id: 'service-a', name: 'Order Service', type: 'service' });
    assert.deepEqual(firstInput.features, [{ id: 'feature-a', name: 'Order Management', type: 'feature' }]);
    assert.deepEqual(firstInput.relations, [
      { parent_id: 'service-a', child_id: 'feature-a', label: 'contains' },
      { parent_id: 'service-a', child_id: 'service-b', label: 'HTTP' },
    ]);
    assert.deepEqual(firstInput.evidence_paths, ['src/service.ts', 'src/feature.ts']);
    assert.match(firstInput.evidence_files[0].content, /real service evidence/);
    assert.match(firstInput.evidence_files[1].content, /real feature evidence/);

    const withoutInstructions = await app.inject({
      method: 'POST', url: `${base}/${action.id}/execute`, payload: {},
    });
    assert.equal(withoutInstructions.statusCode, 200);
    assert.equal(withoutInstructions.json().status, 'done');
    assert.equal(setup.aiCalls(), 2);
    assert.equal(JSON.parse(setup.aiInputs[1]!).additional_instructions, null);

    const withoutBody = await app.inject({
      method: 'POST', url: `${base}/${action.id}/execute`,
    });
    assert.equal(withoutBody.statusCode, 200);
    assert.equal(setup.aiCalls(), 3);
    assert.equal(JSON.parse(setup.aiInputs[2]!).additional_instructions, null);

    const emptyInstructions = await app.inject({
      method: 'POST', url: `${base}/${action.id}/execute`,
      payload: { additional_instructions: '   ' },
    });
    assert.equal(emptyInstructions.statusCode, 200);
    assert.equal(setup.aiCalls(), 4);
    assert.equal(JSON.parse(setup.aiInputs[3]!).additional_instructions, null);
  } finally {
    await app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('delete removes an action and deleted or unknown actions cannot execute', async () => {
  const setup = await fixture();
  const app = setup.startApp();
  try {
    const base = `/projects/${setup.projectIds[0]}/nodes/service-a/actions`;
    const action = (await app.inject({ method: 'POST', url: base, payload: actionPayload })).json();
    const deleted = await app.inject({ method: 'DELETE', url: `${base}/${action.id}` });
    assert.equal(deleted.statusCode, 200);
    assert.deepEqual(deleted.json(), { deleted: true });
    assert.deepEqual((await app.inject({ method: 'GET', url: base })).json(), { actions: [] });
    const execute = await app.inject({ method: 'POST', url: `${base}/${action.id}/execute`, payload: {} });
    assert.equal(execute.statusCode, 404);
    assert.deepEqual(execute.json(), { error: 'Custom action not found' });
    assert.equal((await app.inject({ method: 'DELETE', url: `${base}/${action.id}` })).statusCode, 404);
    assert.equal(setup.aiCalls(), 0);
  } finally {
    await app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('missing readable evidence and oversized instructions prevent AI execution', async () => {
  const setup = await fixture();
  const app = setup.startApp();
  try {
    const base = `/projects/${setup.projectIds[0]}/nodes/service-a/actions`;
    const action = (await app.inject({ method: 'POST', url: base, payload: actionPayload })).json();
    await setup.writeMap(0, false);
    const noEvidence = await app.inject({ method: 'POST', url: `${base}/${action.id}/execute`, payload: {} });
    assert.equal(noEvidence.statusCode, 409);
    assert.deepEqual(noEvidence.json(), { error: 'Service has no readable evidence' });
    assert.equal(setup.aiCalls(), 0);

    await setup.writeMap(0, true);
    const tooLarge = await app.inject({
      method: 'POST', url: `${base}/${action.id}/execute`,
      payload: { additional_instructions: 'x'.repeat(2001) },
    });
    assert.equal(tooLarge.statusCode, 400);
    assert.equal(setup.aiCalls(), 0);
  } finally {
    await app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('OpenAI failures return a generic execution error without deleting the action', async () => {
  const setup = await fixture();
  const app = setup.startApp();
  try {
    const base = `/projects/${setup.projectIds[0]}/nodes/service-a/actions`;
    const action = (await app.inject({ method: 'POST', url: base, payload: actionPayload })).json();
    setup.setAiFailure(true);
    const failed = await app.inject({ method: 'POST', url: `${base}/${action.id}/execute` });
    assert.equal(failed.statusCode, 500);
    assert.deepEqual(failed.json(), { error: 'Custom action execution failed' });
    assert.equal(failed.body.includes('private provider failure'), false);
    assert.equal(setup.aiCalls(), 1);
    assert.deepEqual((await app.inject({ method: 'GET', url: base })).json(), { actions: [action] });
  } finally {
    await app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('custom action routes return existing project and map ownership errors', async () => {
  const setup = await fixture();
  const app = setup.startApp();
  try {
    assert.equal((await app.inject({
      method: 'GET', url: '/projects/unknown/nodes/service-a/actions',
    })).statusCode, 404);
    await saveProjectMap(setup.repositories[0]!, {
      project_id: 'different-project', generated_at: new Date().toISOString(),
      nodes: [{ id: 'service-a', name: 'Order Service', type: 'service' }], relations: [],
    });
    const wrongOwner = await app.inject({
      method: 'GET', url: `/projects/${setup.projectIds[0]}/nodes/service-a/actions`,
    });
    assert.equal(wrongOwner.statusCode, 409);
    assert.deepEqual(wrongOwner.json(), { error: 'Project map belongs to another project' });
    assert.equal(setup.aiCalls(), 0);
  } finally {
    await app.close();
    rmSync(setup.root, { recursive: true, force: true });
  }
});
