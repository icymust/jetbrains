import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import type { ScanResult } from '../analyzer/scanner.js';
import { config } from '../config.js';
import { analyzeProject } from './openai-analyzer.js';
import { createAnthropicRequester } from './anthropic-analyzer.js';

const scan: ScanResult = {
  directories: ['src'],
  files: [
    { path: 'package.json', content: '{"name":"demo"}', truncated: false },
    { path: 'src/auth.ts', content: 'export function login() {}', truncated: false },
  ],
  truncated: false,
};

const graph = {
  nodes: [
    { id: 'service', name: 'Backend', type: 'service', evidence_paths: ['package.json'] },
    { id: 'feature', name: 'Authentication', type: 'feature', evidence_paths: ['src/auth.ts'] },
  ],
  relations: [{ parent_id: 'service', child_id: 'feature', label: 'contains' }],
};

test('Anthropic requester uses JSON schema and the existing graph validation', async () => {
  let request: Record<string, unknown> | undefined;
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  const client = {
    messages: {
      create: async (options: Record<string, unknown>) => {
        request = options;
        return {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify(graph) }],
          usage: { input_tokens: 120, output_tokens: 80 },
        };
      },
    },
  } as unknown as Anthropic;
  const analyzed = await analyzeProject(scan, createAnthropicRequester({
    client, onUsage: (value) => { usage = value; },
  }));

  assert.equal(analyzed.nodes.length, 2);
  assert.equal(analyzed.relations[0]?.label, 'contains');
  assert.deepEqual(analyzed.nodes[1]?.evidence_paths, ['src/auth.ts']);
  assert.deepEqual(usage, { input_tokens: 120, output_tokens: 80 });
  assert.equal(request?.model, config.anthropicModel);
  assert.equal((request?.output_config as { format: { type: string } }).format.type, 'json_schema');
  assert.equal((request?.messages as Array<{ role: string }>)[0]?.role, 'user');
});

test('Anthropic failure is not retried by the requester', async () => {
  let calls = 0;
  const client = {
    messages: {
      create: async () => {
        calls++;
        throw new Error('Mock transport failure');
      },
    },
  } as unknown as Anthropic;
  await assert.rejects(
    analyzeProject(scan, createAnthropicRequester({ client })),
    /Project analysis request failed/,
  );
  assert.equal(calls, 1);
});
