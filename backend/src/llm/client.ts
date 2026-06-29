import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { config } from '../config.js';
import { logger } from '../logger.js';

const openrouter = createOpenRouter({
  apiKey: config.OPENROUTER_API_KEY ?? '',
});
const openrouterModel = openrouter(config.LLM_MODEL);

// Anthropic, used both as the direct fallback (once the key is funded) and as
// the wire protocol for Conduit, which is Anthropic-compatible. Null when no
// key is set (local dev) so the chain skips it.
const anthropic = config.ANTHROPIC_API_KEY ? createAnthropic({ apiKey: config.ANTHROPIC_API_KEY }) : null;

// Conduit gateway: Anthropic-compatible at {base}/v1 with x-api-key auth, so the
// AI SDK Anthropic provider drives it by pointing baseURL at Conduit. Primary
// when CONDUIT_API_KEY is set; uses CONDUIT_MODEL (Sonnet). Null otherwise.
const conduit = config.CONDUIT_API_KEY
  ? createAnthropic({
      apiKey: config.CONDUIT_API_KEY,
      baseURL: `${config.CONDUIT_BASE_URL.replace(/\/$/, '')}/v1`,
    })
  : null;

type LM = LanguageModelV3;

/// Wrap an ordered list of models so a call tries each in turn, dropping to the
/// next on any error. Conduit is primary, the direct Anthropic key is the
/// fallback (until it is funded), and the OpenRouter model is the last resort.
/// withLlmRetry still wraps each call site, so a total wipeout lands on the
/// agent's deterministic path. The chain also means a Conduit hiccup keeps the
/// agents on a live LLM (OpenRouter) instead of falling back to deterministic.
function fallbackChain(models: Array<LM | null>): LM {
  const chain = models.filter((m): m is LM => m !== null);
  const primary = chain[0] ?? openrouterModel;
  if (chain.length <= 1) return primary;
  return {
    ...primary,
    async doGenerate(options) {
      let lastErr: unknown;
      for (const m of chain) {
        try {
          return await m.doGenerate(options);
        } catch (e) {
          lastErr = e;
          logger.warn(
            { provider: m.provider, model: m.modelId, err: (e as Error).message },
            'LLM provider failed, falling back to the next in the chain',
          );
        }
      }
      throw lastErr;
    },
    async doStream(options) {
      let lastErr: unknown;
      for (const m of chain) {
        try {
          return await m.doStream(options);
        } catch (e) {
          lastErr = e;
          logger.warn(
            { provider: m.provider, model: m.modelId, err: (e as Error).message },
            'LLM provider failed (stream), falling back to the next in the chain',
          );
        }
      }
      throw lastErr;
    },
  };
}

/// General agent-loop model for cheap, high-volume calls (intake parsing,
/// keyword extraction). Stays on OpenRouter (Gemini) to keep cost down; the
/// quality-critical models below route through Conduit/Sonnet.
export const llmModel = openrouterModel;

/// Release-gating structured checks (deliverable-meets-requirement verdict).
/// Conduit (Sonnet) primary, direct Anthropic fallback, OpenRouter last.
export const verifierModel = fallbackChain([
  conduit?.(config.CONDUIT_MODEL) ?? null,
  anthropic?.(config.VERIFIER_LLM_MODEL) ?? null,
  openrouterModel,
]);

/// Agent-to-agent negotiation loop (bid scoring, counters, accept/decline,
/// near-miss reasoning) on both sides. Conduit primary, Anthropic fallback,
/// OpenRouter last, so a live negotiation never drops to deterministic just
/// because one provider is down or out of credit.
export const negotiationModel = fallbackChain([
  conduit?.(config.CONDUIT_MODEL) ?? null,
  anthropic?.(config.NEGOTIATION_LLM_MODEL) ?? null,
  openrouterModel,
]);

/// Paid market-research synthesis (per-deal market read + demand score over Exa
/// excerpts). Conduit primary, Anthropic fallback, OpenRouter last.
export const researchModel = fallbackChain([
  conduit?.(config.CONDUIT_MODEL) ?? null,
  anthropic?.(config.RESEARCH_LLM_MODEL) ?? null,
  openrouterModel,
]);
