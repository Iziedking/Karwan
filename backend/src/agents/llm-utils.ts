/// Hard timeout around an LLM call so a slow provider can't wedge the
/// per-(jobId, seller) mutex and stall the whole auction. The agent loops
/// treat a thrown timeout the same as any other LLM failure — log, emit
/// agent.error, move on.
///
/// Default 45s. Gemini Flash Lite usually responds in ~3-5s; Kimi K2.5 and
/// other heavier models can take 20-30s for structured output. Tunable via
/// LLM_TIMEOUT_MS so operators can dial it per model.

import { logger } from '../logger.js';

const envValue = Number(process.env.LLM_TIMEOUT_MS ?? '');
export const LLM_TIMEOUT_MS =
  Number.isFinite(envValue) && envValue > 0 ? envValue : 45_000;

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const v = Number(process.env[name] ?? '');
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

/// Retry budget for LLM calls (docs/agent.md build phase 3). Small on purpose so
/// a live negotiation never hangs waiting on the model. 3 attempts, ~20s total.
export const LLM_RETRY_ATTEMPTS = intEnv('LLM_RETRY_ATTEMPTS', 3, 1, 5);
export const LLM_RETRY_BUDGET_MS = intEnv('LLM_RETRY_BUDGET_MS', 20_000, 1_000, 60_000);
/// Backoff before attempt 2, then attempt 3. Short: parse failures usually clear
/// on the very next try.
const RETRY_BACKOFF_MS = [400, 1_200];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class LlmTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'LlmTimeoutError';
  }
}

export function withLlmTimeout<T>(
  label: string,
  promise: Promise<T>,
  ms: number = LLM_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new LlmTimeoutError(label, ms)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/// Runs an LLM call with bounded retries, then a hard timeout per attempt.
/// `factory` MUST create a fresh promise per call (a plain promise can't be
/// retried). A parse failure (the model returned something that didn't fit the
/// schema) is retried with short backoff, since it usually clears on the next
/// try; a hard timeout is NOT retried (another full attempt would hang the
/// deal). Once the attempts or the budget are spent, the last error is rethrown
/// so the caller's deterministic fallback takes over. This is the one place the
/// LLM's flakiness is absorbed; every call site funnels through here.
export async function withLlmRetry<T>(
  label: string,
  factory: () => Promise<T>,
  opts: { attempts?: number; perAttemptMs?: number; budgetMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? LLM_RETRY_ATTEMPTS;
  const perAttemptMs = opts.perAttemptMs ?? LLM_TIMEOUT_MS;
  const budgetMs = opts.budgetMs ?? LLM_RETRY_BUDGET_MS;
  const start = Date.now();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withLlmTimeout(label, factory(), perAttemptMs);
    } catch (err) {
      lastErr = err;
      if (err instanceof LlmTimeoutError) break; // timeouts don't retry
      if (attempt >= attempts) break;
      if (Date.now() - start >= budgetMs) break;
      const backoff = RETRY_BACKOFF_MS[attempt - 1] ?? 1_000;
      logger.warn(
        { label, attempt, err: (err as Error).message },
        'LLM call failed, retrying',
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}
