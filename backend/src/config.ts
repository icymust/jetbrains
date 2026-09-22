import { resolve } from 'node:path';

const port = Number(process.env.PORT ?? 3000);
const aiProvider = process.env.AI_PROVIDER ?? 'openai';

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}
if (aiProvider !== 'openai' && aiProvider !== 'anthropic') {
  throw new Error('AI_PROVIDER must be openai or anthropic');
}

export const config = {
  port,
  databasePath: resolve(process.env.DATABASE_PATH ?? '.data/projects.sqlite'),
  aiProvider,
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
};
