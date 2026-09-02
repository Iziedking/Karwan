import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject, type FlexibleSchema } from 'ai';
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
// provider for agent calls when the direct key is unavailable. Empty when no
// Conduit key is set. NOTE: Conduit failures log as provider
// 'anthropic.messages' (same wire protocol) — tell them apart by baseURL, not
// the provider name.
const conduitBaseUrl = `${config.CONDUIT_BASE_URL.replace(/\/$/, '')}/v1`;
const conduitModels: LM[] = conduitApiKeys().map((apiKey) =>
  createAnthropic({ apiKey, baseURL: conduitBaseUrl })(config.CONDUIT_MODEL),
);

/// Wrap an ordered list of models so a call tries each in turn, dropping to the
/// next on any error. The direct Anthropic key (Haiku) is primary, Conduit is
/// the compatible fallback, and OpenRouter is the final paid fallback. withLlmRetry still
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

/// Structured-output boundary built against ai 6.0.180, @openrouter/ai-sdk-provider
/// 2.9.0, and @ai-sdk/anthropic 3.0.85 (installed versions read 2026-09-02).
/// AI SDK schema validation happens after a provider's doGenerate call, so the
/// model-level wrapper above cannot see malformed JSON/schema results. Keep the
/// candidate loop here so provider outages and invalid structured responses both
/// reach the next funded provider.
export async function generateObjectWithLlmFallback<SCHEMA extends FlexibleSchema<unknown>>(
  options: { schema: SCHEMA; prompt: string },
) {
  return runWithLlmFallback(llmModelCandidates, (model) =>
    generateObject({
      model,
      schema: options.schema,
      prompt: options.prompt,
    }),
  );
}

export async function runWithLlmFallback<
  MODEL extends { provider: string; modelId: string },
  RESULT,
>(models: readonly MODEL[], operation: (model: MODEL) => Promise<RESULT>): Promise<RESULT> {
  let lastError: unknown;
  for (const model of models) {
    try {
      return await operation(model);
    } catch (error) {
      lastError = error;
      logger.warn(
        { provider: model.provider, model: model.modelId, err: (error as Error).message },
        'Structured LLM response failed, falling back to the next model',
      );
    }
  }
  throw lastError ?? new Error('No structured LLM provider is configured');
}

/// General agent-loop model for cheap, high-volume calls (intake parsing,
/// keyword extraction). Match the assistant's provider order: direct Anthropic
/// first, then Conduit, then OpenRouter. This keeps agents alive when the
/// OpenRouter budget is exhausted and the direct key is unavailable.
export const llmModelCandidates: LM[] = [
  anthropic?.(config.FAST_LLM_MODEL) ?? null,
  ...conduitModels,
  openrouterModel,
].filter((m): m is LM => m !== null);

export const llmModel = fallbackChain(llmModelCandidates);

/// Release-gating structured checks (deliverable-meets-requirement verdict).
/// Direct Anthropic (Haiku) primary, Conduit fallback, OpenRouter paid fallback.
/// This matches the assistant route so agent calls remain available when the
/// direct key is unavailable and OpenRouter credits are exhausted.
export const verifierModel = fallbackChain([
  anthropic?.(config.VERIFIER_LLM_MODEL) ?? null,
  ...conduitModels,
  openrouterModel,
]);

/// Agent-to-agent negotiation loop (bid scoring, counters, accept/decline,
/// near-miss reasoning) on both sides. Anthropic (Haiku) primary, Conduit
/// fallback, OpenRouter paid fallback, so a live negotiation never drops to
/// deterministic just because one provider is down or out of credit.
export const negotiationModel = fallbackChain([
  anthropic?.(config.NEGOTIATION_LLM_MODEL) ?? null,
  ...conduitModels,
  openrouterModel,
]);

/// Paid market-research synthesis (per-deal market read + demand score over Exa
/// excerpts). Anthropic (Haiku) primary, Conduit fallback, OpenRouter paid fallback.
export const researchModel = fallbackChain([
  anthropic?.(config.RESEARCH_LLM_MODEL) ?? null,
  ...conduitModels,
  openrouterModel,
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

/// Authenticated assistant model. Same reasoning as supervisorModel, same
/// invariant: the authenticated assistant runs a tool-calling loop that reads the
/// signed-in user's OWN balance and deals, so its prompt + tool results carry
/// private account data. That must never reach a third-party proxy, so this is
/// the DIRECT Anthropic key ONLY — NOT a fallbackChain, no Conduit, no OpenRouter.
/// Null when no Anthropic key: callers fall back to the anonymous, knowledge-only
/// provider chain (which never sees private data), never to a proxy for this input.
export const assistantAgentModel: LM | null = anthropic?.(config.ASSISTANT_AGENT_LLM_MODEL) ?? null;
