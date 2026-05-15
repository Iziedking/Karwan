/// Hard timeout around an LLM call so a slow provider can't wedge the
/// per-(jobId, seller) mutex and stall the whole auction. The agent loops
/// treat a thrown timeout the same as any other LLM failure — log, emit
/// agent.error, move on.

export const LLM_TIMEOUT_MS = 15_000;

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
