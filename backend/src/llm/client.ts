import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { config, conduitApiKeys } from '../config.js';
import { logger } from '../logger.js';

const openrouter = createOpenRouter({
  apiKey: config.OPENROUTER_API_KEY ?? '',
});
const openrouterModel = openrouter(config.LLM_MODEL);

// Anthropic, used both as the direct fallback (once the key is funded) and as
// the wire protocol for Conduit, which is Anthropic-compatible. Null when no
// key is set (local dev) so the chain skips it.
const anthropic = config.ANTHROPIC_API_KEY ? createAnthropic({ apiKey: config.ANTHROPIC_API_KEY }) : null;

type LM = LanguageModelV3;

// Conduit gateway: Anthropic-compatible at {base}/v1 with x-api-key auth, so the
// AI SDK Anthropic provider drives it by pointing baseURL at Conduit. One model
// per configured Conduit key (free-tier accounts), tried in order. Sits LAST in
// every chain — behind the funded Anthropic key AND OpenRouter — because it is a
// free-tier third-party gateway with keys we've seen go dead. It is the deep
// safety net that keeps agents on a live LLM only when both paid providers are
// down. Empty when no Conduit key is set. NOTE: Conduit failures log as provider
// 'anthropic.messages' (same wire protocol) — tell them apart by baseURL, not
// the provider name.
const conduitBaseUrl = `${config.CONDUIT_BASE_URL.replace(/\/$/, '')}/v1`;
const conduitModels: LM[] = conduitApiKeys().map((apiKey) =>
  createAnthropic({ apiKey, baseURL: conduitBaseUrl })(config.CONDUIT_MODEL),
);

/// Wrap an ordered list of models so a call tries each in turn, dropping to the
/// next on any error. The direct Anthropic key (Haiku) is primary, OpenRouter the
/// paid fallback, and Conduit the last-resort safety net. withLlmRetry still
/// wraps each call site, so a total wipeout lands on the agent's deterministic
/// path. The chain means one provider's outage keeps the agents on a live LLM
/// instead of falling back to deterministic.
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
/// keyword extraction). OpenRouter (Gemini) primary to keep cost down, direct
/// Anthropic Haiku as the fallback: without it, an out-of-credit OpenRouter
/// killed intake and keyword extraction outright while every other chain kept
/// running — the cheapest calls were the only ones with no second provider.
export const llmModel = fallbackChain([
  openrouterModel,
  anthropic?.(config.FAST_LLM_MODEL) ?? null,
]);

/// Release-gating structured checks (deliverable-meets-requirement verdict).
/// Direct Anthropic (Haiku) primary, OpenRouter paid fallback, Conduit last. The
/// funded direct key goes first; Conduit trails both paid providers so a quality
/// call only reaches the free gateway when both are down.
export const verifierModel = fallbackChain([
  anthropic?.(config.VERIFIER_LLM_MODEL) ?? null,
  openrouterModel,
  ...conduitModels,
]);

/// Agent-to-agent negotiation loop (bid scoring, counters, accept/decline,
/// near-miss reasoning) on both sides. Anthropic (Haiku) primary, OpenRouter
/// paid fallback, Conduit last, so a live negotiation never drops to
/// deterministic just because one provider is down or out of credit.
export const negotiationModel = fallbackChain([
  anthropic?.(config.NEGOTIATION_LLM_MODEL) ?? null,
  openrouterModel,
  ...conduitModels,
]);

/// Paid market-research synthesis (per-deal market read + demand score over Exa
/// excerpts). Anthropic (Haiku) primary, OpenRouter paid fallback, Conduit last.
export const researchModel = fallbackChain([
  anthropic?.(config.RESEARCH_LLM_MODEL) ?? null,
  openrouterModel,
  ...conduitModels,
]);

/// Phase-C supervisor model. Deliberately NOT a fallbackChain: the supervisor
/// reads captured errors plus the aggregated event context around them, so its
/// prompts carry deal data (parties, amounts, briefs). That must never reach a
/// third-party proxy, so this is the DIRECT Anthropic key ONLY — no Conduit, no
/// OpenRouter. It is null when no Anthropic key is set, and callers MUST treat
/// null as "supervisor disabled" rather than routing elsewhere. This is the one
/// model export that is allowed to be unavailable instead of degrading to a
/// proxy, precisely because the privacy boundary matters more than uptime here.
export const supervisorModel: LM | null = anthropic?.(config.SUPERVISOR_LLM_MODEL) ?? null;
