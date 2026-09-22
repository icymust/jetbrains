import assert from 'node:assert/strict';
import { test } from 'node:test';
import type OpenAI from 'openai';
import type { ScanResult } from '../analyzer/scanner.js';
import { toPublicGraph } from '../analyzer/types.js';
import { AnalysisError, analyzeProject, buildModelInput, createOpenAIRequester, instructions } from './openai-analyzer.js';

const scan: ScanResult = {
  directories: ['src', 'src/auth'],
  files: [
    { path: 'package.json', content: '{"name":"demo"}', truncated: false },
    { path: 'src/auth/login.ts', content: 'export function login() {}', truncated: false },
  ],
  truncated: false,
};

const modelGraph = {
  nodes: [
    { id: 'svc', name: 'Backend', type: 'service', evidence_paths: ['package.json'] },
    { id: 'auth', name: 'Authentication', type: 'feature', evidence_paths: ['src/auth/login.ts'] },
  ],
  relations: [
    { parent_id: 'svc', child_id: 'auth', label: 'contains' },
    { parent_id: 'svc', child_id: 'auth', label: 'contains' },
  ],
};

test('analyzer keeps evidence internally, removes duplicate relations, and produces stable public IDs', async () => {
  const first = await analyzeProject(scan, { request: async () => JSON.stringify(modelGraph) });
  const renamedTemporaryIds = structuredClone(modelGraph);
  renamedTemporaryIds.nodes[0]!.id = 'different-service-handle';
  renamedTemporaryIds.nodes[1]!.id = 'different-feature-handle';
  renamedTemporaryIds.relations = [{ parent_id: 'different-service-handle', child_id: 'different-feature-handle', label: 'contains' }];
  const second = await analyzeProject(scan, { request: async () => JSON.stringify(renamedTemporaryIds) });

  assert.deepEqual(first.nodes.map((node) => node.id), second.nodes.map((node) => node.id));
  assert.equal(first.relations.length, 1);
  assert.equal(toPublicGraph(first).relations[0]?.label, 'contains');
  assert.deepEqual(first.nodes[1]?.evidence_paths, ['src/auth/login.ts']);
  assert.deepEqual(Object.keys(toPublicGraph(first).nodes[1]!).sort(), ['id', 'name', 'type']);
  assert.equal(JSON.parse(buildModelInput(scan)).files[1].path, 'src/auth/login.ts');
});

test('one service may contain multiple features', async () => {
  const graph = structuredClone(modelGraph);
  graph.nodes.push({ id: 'users', name: 'User Management', type: 'feature', evidence_paths: ['src/auth/login.ts'] });
  graph.relations.push({ parent_id: 'svc', child_id: 'users', label: 'contains' });
  const analyzed = await analyzeProject(scan, { request: async () => JSON.stringify(graph) });
  assert.equal(analyzed.nodes.filter((node) => node.type === 'service').length, 1);
  assert.equal(analyzed.nodes.filter((node) => node.type === 'feature').length, 2);
  assert.equal(analyzed.relations.length, 2);
});

test('evidence-based service connections keep their free-text labels', async () => {
  const graph = structuredClone(modelGraph);
  graph.nodes.push({ id: 'orders', name: 'Order Service', type: 'service', evidence_paths: ['src/auth/login.ts'] });
  graph.relations.push({ parent_id: 'svc', child_id: 'orders', label: 'gRPC' });
  const analyzed = await analyzeProject(scan, { request: async () => JSON.stringify(graph) });
  assert.equal(analyzed.relations.find((relation) => relation.label === 'gRPC')?.parent_id, analyzed.nodes[0]?.id);
});

test('prompt favors domain features and direct evidence-based service connections', () => {
  assert.match(instructions, /meaningful application or domain features/);
  assert.match(instructions, /clients and servers, controllers, routes, repositories, adapters, SDK wrappers/);
  assert.match(instructions, /evidence for features and relations, not feature nodes/);
  assert.match(instructions, /direct directed service-to-service relation/);
  assert.match(instructions, /observed protocol such as HTTP or gRPC/);
  assert.match(instructions, /relation labeled "contains"/);
});

test('mocked domain graph keeps direct service relations, evidence, and stable IDs', async () => {
  const repository: ScanResult = {
    directories: ['billing', 'catalog'],
    files: [
      { path: 'billing/server.ts', content: 'registerCheckoutRoutes()', truncated: false },
      { path: 'billing/catalog-client.ts', content: 'fetch("/inventory")', truncated: false },
      { path: 'catalog/server.ts', content: 'registerInventoryRoutes()', truncated: false },
    ],
    truncated: false,
  };
  const graph = {
    nodes: [
      { id: 'a', name: 'Billing', type: 'service', evidence_paths: ['billing/server.ts'] },
      { id: 'b', name: 'Catalog', type: 'service', evidence_paths: ['catalog/server.ts'] },
      { id: 'c', name: 'Checkout', type: 'feature', evidence_paths: ['billing/server.ts'] },
      { id: 'd', name: 'Inventory', type: 'feature', evidence_paths: ['catalog/server.ts'] },
    ],
    relations: [
      { parent_id: 'a', child_id: 'c', label: 'contains' },
      { parent_id: 'b', child_id: 'd', label: 'contains' },
      { parent_id: 'a', child_id: 'b', label: 'HTTP' },
    ],
  };
  const first = await analyzeProject(repository, { request: async () => JSON.stringify(graph) });
  const renamed = structuredClone(graph);
  for (const node of renamed.nodes) node.id = `new-${node.id}`;
  for (const relation of renamed.relations) {
    relation.parent_id = `new-${relation.parent_id}`;
    relation.child_id = `new-${relation.child_id}`;
  }
  const second = await analyzeProject(repository, { request: async () => JSON.stringify(renamed) });

  assert.deepEqual(first, second);
  assert.deepEqual(first.nodes.map((node) => node.name), ['Billing', 'Catalog', 'Checkout', 'Inventory']);
  assert.deepEqual(first.nodes[2]?.evidence_paths, ['billing/server.ts']);
  assert.deepEqual(first.relations.map((relation) => relation.label), ['contains', 'contains', 'HTTP']);
  assert.deepEqual(first.relations[2], {
    parent_id: first.nodes[0]?.id,
    child_id: first.nodes[1]?.id,
    label: 'HTTP',
  });
});

test('analyzer rejects unsupported evidence, invalid relations, duplicate nodes, and empty graphs', async () => {
  const invalidGraphs = [
    { ...modelGraph, nodes: [{ ...modelGraph.nodes[0], evidence_paths: ['invented.ts'] }, modelGraph.nodes[1]] },
    { ...modelGraph, relations: [{ parent_id: 'svc', child_id: 'auth', label: '' }] },
    { ...modelGraph, relations: [{ parent_id: 'svc', child_id: 'auth', label: 'x'.repeat(41) }] },
    { ...modelGraph, relations: [{ parent_id: 'missing', child_id: 'auth', label: 'uses' }] },
    { ...modelGraph, nodes: [modelGraph.nodes[0], modelGraph.nodes[0]] },
    { nodes: [], relations: [] },
  ];
  for (const graph of invalidGraphs) {
    await assert.rejects(
      analyzeProject(scan, { request: async () => JSON.stringify(graph) }),
      AnalysisError,
    );
  }
});

test('analyzer reports API failures without returning a graph', async () => {
  await assert.rejects(
    analyzeProject(scan, { request: async () => { throw new Error('network failure'); } }),
    /Project analysis request failed/,
  );
});

test('OpenAI requester uses Responses API strict JSON Schema', async () => {
  let request: Record<string, unknown> | undefined;
  const client = {
    responses: {
      create: async (options: Record<string, unknown>) => {
        request = options;
        return { status: 'completed', output_text: JSON.stringify(modelGraph) };
      },
    },
  } as unknown as OpenAI;
  const output = await createOpenAIRequester(client).request(buildModelInput(scan));
  assert.deepEqual(JSON.parse(output), modelGraph);
  assert.equal((request?.text as { format: { strict: boolean } }).format.strict, true);
  assert.equal((request?.text as { format: { type: string } }).format.type, 'json_schema');
  assert.equal(request?.input, buildModelInput(scan));
});
