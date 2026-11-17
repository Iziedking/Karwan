import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { generateObject, type FlexibleSchema } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { anthropicAuthFrom } from './anthropicAuth.js';
import { anthropicLink } from './anthropicLink.js';
import { chainLinks, fallbackChain } from './chain.js';
import { fitCachePoints, withoutCachePoints } from './cachePoints.js';
import { reportModelsDown } from './modelsDown.js';

const openrouter = createOpenRouter({
  apiKey: config.OPENROUTER_API_KEY ?? '',
});
const openrouterModel = openrouter(config.LLM_MODEL);

// Claude at Anthropic, with a pass from the server's AWS role when that is set
// up, else with the key (view 89). Null when neither is set, so the chain skips it.
const link = anthropicLink(
  anthropicAuthFrom({
    ruleId: config.ANTHROPIC_FEDERATION_RULE_ID,
    organizationId: config.ANTHROPIC_ORGANIZATION_ID,
    workspaceId: config.ANTHROPIC_WORKSPACE_ID,
    serviceAccountId: config.ANTHROPIC_SERVICE_ACCOUNT_ID,
    stsRegion: config.ANTHROPIC_STS_REGION,
    awsRegion: config.AWS_REGION,
    apiKey: config.ANTHROPIC_API_KEY,
  }),
);
const anthropic = link?.provider ?? null;
/// The pass keeper the assistant's own request shares, null without a pass.
export const anthropicKeeper = link?.keeper ?? null;
/// How Claude at Anthropic is reached: 'pass', 'key', or null when it is not.
export const anthropicHow = link?.how ?? null;
/// One Claude model at Anthropic on the same pass or key, for the scripts.
export const anthropicModel = (id: string): LanguageModelV3 | null => (anthropic ? (anthropic(id) as LanguageModelV3) : null);

type LM = LanguageModelV3;

// Claude Haiku on Amazon Bedrock, in Karwan's own AWS account. Null unless
// BEDROCK_ENABLED, so every chain below simply starts at the next model.
const bedrock = config.BEDROCK_ENABLED
  ? createAmazonBedrock({ region: config.BEDROCK_REGION, credentialProvider: fromNodeProviderChain() })
  : null;
/// Each Bedrock model gets the cache it can take: an hour for Claude, five
/// minutes for the rest (view 84).
const onBedrock = (id: string): LM | null => (bedrock ? (fitCachePoints(bedrock(id)) as LM) : null);
export const bedrockModel: LM | null = onBedrock(config.BEDROCK_MODEL);
/// The cheaper model for simple classification, when configured.
export const bedrockLightModel: LM | null = config.BEDROCK_LIGHT_MODEL ? onBedrock(config.BEDROCK_LIGHT_MODEL) : null;
/// A model that is not Claude, on Bedrock, so a refused Anthropic account or
/// an empty Anthropic balance never leaves Karwan without a model (view 81).
/// It has no prompt caching, so the assistant's cache points are taken out
/// before a call reaches it (view 84).
export const bedrockFallbackModel: LM | null = config.BEDROCK_FALLBACK_MODEL && bedrock
  ? (withoutCachePoints(bedrock(config.BEDROCK_FALLBACK_MODEL)) as LM)
  : null;

/// One chain per job: Claude at Anthropic with the job's model, Claude on
/// Bedrock, the fallback on Bedrock, then OpenRouter unless the chain is private.
function chainFor(anthropicModel: string, scope: 'open' | 'private'): LM[] {
  return chainLinks(
    {
      bedrock: bedrockModel,
      anthropic: anthropic?.(anthropicModel) ?? null,
      fallback: bedrockFallbackModel,
      openrouter: openrouterModel,
    },
    scope,
  );
}

function modelOf(models: LM[]): LM {
  return fallbackChain(models.length > 0 ? models : [openrouterModel], reportModelsDown);
}

/// For prompts that carry private account or deal data: never OpenRouter.
/// Null when no direct link is configured.
function directChain(anthropicModel: string): LM | null {
  const models = chainFor(anthropicModel, 'private');
  return models.length === 0 ? null : fallbackChain(models, reportModelsDown);
}

/// Structured-output boundary built against ai 6.0.180, @openrouter/ai-sdk-provider
/// 2.9.0, and @ai-sdk/anthropic 3.0.85 (installed versions read 2026-09-02).
/// AI SDK schema validation happens after a provider's doGenerate call, so the
/// model-level wrapper above cannot see malformed JSON/schema results. Keep the
/// candidate loop here so provider outages and invalid structured responses both
/// reach the next funded provider.
export async function generateObjectWithLlmFallback<SCHEMA extends FlexibleSchema<unknown>>(
  options: { schema: SCHEMA; prompt: string },
  tier: 'standard' | 'light' = 'standard',
) {
  const models = tier === 'light' ? lightModelCandidates : llmModelCandidates;
  try {
    return await runWithLlmFallback(models, (model) =>
      generateObject({
        model,
        schema: options.schema,
        prompt: options.prompt,
      }),
    );
  } catch (err) {
    reportModelsDown(models.map((m) => ({ provider: m.provider, error: m === models.at(-1) ? (err as Error).message.slice(0, 200) : 'failed, see the log' })));
    throw err;
  }
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
/// keyword extraction).
export const llmModelCandidates: LM[] = chainFor(config.FAST_LLM_MODEL, 'open');

export const llmModel = modelOf(llmModelCandidates);

/// Simple yes/no and tagging calls: the cheaper model first, then the standard
/// chain, so an answer the cheap model gets wrong in shape still lands on Haiku.
export const lightModelCandidates: LM[] = [bedrockLightModel, ...llmModelCandidates].filter((m): m is LM => m !== null);
export const lightModel = modelOf(lightModelCandidates);

/// Release-gating structured checks (deliverable-meets-requirement verdict).
export const verifierModel = modelOf(chainFor(config.VERIFIER_LLM_MODEL, 'open'));

/// Agent-to-agent negotiation loop (bid scoring, counters, accept/decline,
/// near-miss reasoning) on both sides.
export const negotiationModel = modelOf(chainFor(config.NEGOTIATION_LLM_MODEL, 'open'));

/// Paid market-research synthesis (per-deal market read + demand score over Exa
/// excerpts).
export const researchModel = modelOf(chainFor(config.RESEARCH_LLM_MODEL, 'open'));

/// Phase-C supervisor model. Its prompts carry deal data (parties, amounts,
/// briefs), so it never reaches a third-party proxy: a private chain. Null when
/// no direct link is configured, and callers treat null as "supervisor
/// disabled" rather than routing elsewhere.
export const supervisorModel: LM | null = directChain(config.SUPERVISOR_LLM_MODEL);

/// Authenticated assistant model. Its tool loop reads the signed-in person's
/// own balance and deals, so it is a private chain too. Null when no direct
/// link is configured: callers fall back to the knowledge-only chain, which
/// never sees private data.
export const assistantAgentModel: LM | null = directChain(config.ASSISTANT_AGENT_LLM_MODEL);

/// Every model a chain can reach, by name, for the probe script and the
/// diagnostics page. Raw models: no fallback, no cleaning.
export function modelLinks(): { name: string; model: LM }[] {
  const links: { name: string; model: LM | null }[] = [
    { name: `Claude at Anthropic, ${anthropicHow ?? 'off'} (${config.FAST_LLM_MODEL})`, model: anthropic?.(config.FAST_LLM_MODEL) ?? null },
    { name: `Claude on Bedrock (${config.BEDROCK_MODEL})`, model: bedrockModel },
    { name: `Fallback on Bedrock (${config.BEDROCK_FALLBACK_MODEL})`, model: bedrockFallbackModel },
    { name: `Light model on Bedrock (${config.BEDROCK_LIGHT_MODEL ?? 'none'})`, model: bedrockLightModel },
    { name: `OpenRouter (${config.LLM_MODEL})`, model: config.OPENROUTER_API_KEY ? openrouterModel : null },
  ];
  return links.filter((l): l is { name: string; model: LM } => l.model !== null);
}
