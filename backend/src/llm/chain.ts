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

/// How long a link refused for good sits out before it is asked again.
export const BENCH_MS = 10 * 60 * 1000;

const REFUSED = /not allowed for this account|credit balance|access ?denied|not authori[sz]ed|unauthori[sz]ed|forbidden|invalid.{0,4}api.?key|security token.*invalid/i;

/// A refusal that will not pass on the next call: no access, no credit, a bad
/// key. A timeout, a busy model or a network fault is worth asking again.
export function refusedForGood(e: unknown): boolean {
  const status = (e as { statusCode?: number })?.statusCode;
  if (status === 401 || status === 402 || status === 403) return true;
  return REFUSED.test((e as Error)?.message ?? String(e));
}

/// Each call tries the links in turn and moves on after any error. A link
/// refused for good sits out for ten minutes, so a person is not kept waiting
/// on models that cannot answer; it stays the last resort meanwhile. A reply
/// has its model markup removed. When every link fails, `onExhausted` hears
/// which links failed and why, and the last error is thrown to the caller.
export function fallbackChain(
  models: LM[],
  onExhausted: (failures: LinkFailure[]) => void,
  opts: { now?: () => number } = {},
): LM {
  if (models.length === 0) throw new Error('a model chain needs at least one model');
  const primary = models[0]!;
  const now = opts.now ?? Date.now;
  const benchedUntil = new Map<LM, number>();
  async function run<T>(call: (m: LM) => Promise<T>, label: string): Promise<T> {
    const failures: LinkFailure[] = [];
    let lastErr: unknown;
    const at = now();
    const benched = (m: LM) => (benchedUntil.get(m) ?? -Infinity) > at;
    const order = [...models.filter((m) => !benched(m)), ...models.filter(benched)];
    for (const m of order) {
      try {
        const out = await call(m);
        benchedUntil.delete(m);
        return out;
      } catch (e) {
        lastErr = e;
        const error = ((e as Error).message ?? String(e)).slice(0, 200);
        failures.push({ provider: m.provider, error });
        if (refusedForGood(e)) benchedUntil.set(m, now() + BENCH_MS);
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
