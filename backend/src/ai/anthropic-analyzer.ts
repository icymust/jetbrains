import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { graphSchema, instructions, type GraphRequester } from './openai-analyzer.js';

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export function createAnthropicRequester(options: {
  client?: Anthropic;
  onUsage?: (usage: AnthropicUsage) => void;
} = {}): GraphRequester {
  return {
    async request(input) {
      if (!config.anthropicApiKey && !options.client) {
        throw new Error('ANTHROPIC_API_KEY is required for project analysis');
      }
      const client = options.client ?? new Anthropic({
        apiKey: config.anthropicApiKey,
        maxRetries: 0,
      });
      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model: config.anthropicModel,
          max_tokens: 2048,
          system: instructions,
          messages: [{ role: 'user', content: input }],
          output_config: { format: { type: 'json_schema', schema: graphSchema } },
        });
      } catch (error) {
        const status = error instanceof Anthropic.APIError ? error.status : undefined;
        throw new Error(status ? `Anthropic request failed (HTTP ${status})` : 'Anthropic request failed');
      }
      options.onUsage?.({
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });
      if (response.stop_reason !== 'end_turn') {
        throw new Error(`Anthropic response stopped: ${response.stop_reason ?? 'unknown'}`);
      }
      const output = response.content.filter((block) => block.type === 'text')
        .map((block) => block.text).join('');
      if (!output) throw new Error('Anthropic returned no graph');
      return output;
    },
  };
}
