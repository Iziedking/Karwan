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

/// Model for the agent-to-agent negotiation loop (bid scoring + counter
/// suggestion, accept/decline/counter evaluation, near-miss reasoning) on both
/// sides. Native Anthropic Haiku for reliable structured output so a dropped
/// JSON object never derails a live negotiation. Falls back to the OpenRouter
/// model in local dev when no Anthropic key is present.
export const negotiationModel = config.ANTHROPIC_API_KEY
  ? anthropic(config.NEGOTIATION_LLM_MODEL)
  : llmModel;
