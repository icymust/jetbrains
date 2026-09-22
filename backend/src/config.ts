import { resolve } from 'node:path';

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}
export const config = {
  port,
  databasePath: resolve(process.env.DATABASE_PATH ?? '.data/projects.sqlite'),
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL ?? 'gpt-5.6-terra',
};
