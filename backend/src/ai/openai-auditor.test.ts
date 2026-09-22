import assert from 'node:assert/strict';
import { test } from 'node:test';
import type OpenAI from 'openai';
import { auditSchema, createOpenAIAuditRequester, validateAudit } from './openai-auditor.js';

const valid = {
  overall_score: 80,
  optimization_score: 75,
  maintainability_score: 85,
  improvements: [
    { title: 'First', description: 'Do the first change.' },
    { title: 'Second', description: 'Do the second change.' },
  ],
};

test('audit requester uses strict Structured Outputs', async () => {
  let options: Record<string, unknown> | undefined;
  const client = {
    responses: {
      async create(input: Record<string, unknown>) {
        options = input;
        return { status: 'completed', output_text: JSON.stringify(valid) };
      },
    },
  } as unknown as OpenAI;
  const output = await createOpenAIAuditRequester(client).request('{"evidence":true}');
  assert.deepEqual(JSON.parse(output), valid);
  assert.equal(options?.input, '{"evidence":true}');
  assert.equal((options?.text as { format: { strict: boolean } }).format.strict, true);
  assert.deepEqual((options?.text as { format: { schema: unknown } }).format.schema, auditSchema);
});

test('local audit validation enforces scores and exactly two concise improvements', () => {
  assert.deepEqual(validateAudit(valid), valid);
  for (const invalid of [
    { ...valid, overall_score: -1 },
    { ...valid, optimization_score: 100.5 },
    { ...valid, maintainability_score: 101 },
    { ...valid, improvements: valid.improvements.slice(0, 1) },
    { ...valid, improvements: [{ title: '', description: 'Bad' }, valid.improvements[1]] },
    { ...valid, extra: true },
  ]) assert.throws(() => validateAudit(invalid), /Invalid audit/);
});
