import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import { config } from '../config.js';

const openrouter = createOpenRouter({
  apiKey: config.OPENROUTER_API_KEY ?? '',
});

export const llmModel = openrouter(config.LLM_MODEL);

/// Model for release-gating structured checks (the deliverable-meets-requirement
/// verdict). Runs natively on Anthropic so Haiku's strict JSON adherence avoids
/// the parse failures Flash Lite hits via OpenRouter. When ANTHROPIC_API_KEY is
/// absent (local dev), it falls back to the OpenRouter model so nothing breaks.
const anthropic = createAnthropic({ apiKey: config.ANTHROPIC_API_KEY });
export const verifierModel = config.ANTHROPIC_API_KEY
  ? anthropic(config.VERIFIER_LLM_MODEL)
  : llmModel;
