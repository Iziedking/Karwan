import { anthropic } from '@ai-sdk/anthropic';
import { config } from '../config.js';

export const llmModel = anthropic(config.LLM_MODEL);
