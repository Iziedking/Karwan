import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from '../config.js';

const openrouter = createOpenRouter({
  apiKey: config.OPENROUTER_API_KEY ?? '',
});

export const llmModel = openrouter(config.LLM_MODEL);
