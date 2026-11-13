import type { LanguageModelV3 } from '@ai-sdk/provider';
import { logger } from '../logger.js';
import { cleanModelText } from './cleanText.js';

/// How every model chain is built (view 81). The order is Claude on Bedrock,
/// the Anthropic key, a model that is not Claude on Bedrock, then OpenRouter.
/// A private chain carries a person's own data and never goes to OpenRouter;
/// Bedrock runs in Karwan's own AWS account, so both Bedrock links stay in it.

type LM = LanguageModelV3;

export interface Links {
  bedrock: LM | null;
  anthropic: LM | null;
  fallback: LM | null;
  openrouter: LM | null;
}

export function chainLinks(links: Links, scope: 'open' | 'private'): LM[] {
  const order = [links.bedrock, links.anthropic, links.fallback, scope === 'open' ? links.openrouter : null];
  return order.filter((m): m is LM => m !== null);
}

export interface LinkFailure {
  provider: string;
  error: string;
}

type Generated = Awaited<ReturnType<LM['doGenerate']>>;

function cleaned(result: Generated): Generated {
  const content: Generated['content'] = [];
  for (const part of result.content) {
    if (part.type !== 'text') {
      content.push(part);
      continue;
    }
    const text = cleanModelText(part.text);
    if (text) content.push({ ...part, text });
  }
  return { ...result, content };
}

/// Each call tries the links in turn and moves on after any error. A reply has
/// its model markup removed. When every link fails, `onExhausted` hears which
/// links failed and why, and the last error is thrown to the caller.
export function fallbackChain(models: LM[], onExhausted: (failures: LinkFailure[]) => void): LM {
  if (models.length === 0) throw new Error('a model chain needs at least one model');
  const primary = models[0]!;
  async function run<T>(call: (m: LM) => Promise<T>, label: string): Promise<T> {
    const failures: LinkFailure[] = [];
    let lastErr: unknown;
    for (const m of models) {
      try {
        return await call(m);
      } catch (e) {
        lastErr = e;
        const error = ((e as Error).message ?? String(e)).slice(0, 200);
        failures.push({ provider: m.provider, error });
        logger.warn({ provider: m.provider, model: m.modelId, err: error }, `LLM provider failed${label}, falling back to the next in the chain`);
      }
    }
    onExhausted(failures);
    throw lastErr;
  }
  return {
    ...primary,
    specificationVersion: primary.specificationVersion,
    provider: primary.provider,
    modelId: primary.modelId,
    supportedUrls: primary.supportedUrls,
    doGenerate: (options) => run(async (m) => cleaned(await m.doGenerate(options)), ''),
    doStream: (options) => run(async (m) => m.doStream(options), ' (stream)'),
  };
}

export const ALERT_EVERY_MS = 60 * 60 * 1000;

export function shouldAlert(lastAlertAt: number | null, now: number): boolean {
  return lastAlertAt === null || now - lastAlertAt >= ALERT_EVERY_MS;
}
