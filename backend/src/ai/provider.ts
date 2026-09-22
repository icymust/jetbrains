import { config } from '../config.js';
import { createAnthropicRequester } from './anthropic-analyzer.js';
import { createOpenAIRequester, type GraphRequester } from './openai-analyzer.js';

export function createConfiguredRequester(): GraphRequester {
  return config.aiProvider === 'anthropic'
    ? createAnthropicRequester()
    : createOpenAIRequester();
}
