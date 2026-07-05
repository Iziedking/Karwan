/// In-flight seller-evaluation counter per jobId. The seller sweep marks each
/// agent's evaluation (research await + LLM decision + bid tx) while it runs;
/// the buyer's bid-collection window reads it to close when the market has
/// actually answered instead of on a blind timer. Same-process only, like the
/// rest of the agent runtime.

const pending = new Map<string, number>();

export function evaluationStarted(jobId: string): void {
  pending.set(jobId, (pending.get(jobId) ?? 0) + 1);
}

export function evaluationFinished(jobId: string): void {
  const next = (pending.get(jobId) ?? 1) - 1;
  if (next <= 0) pending.delete(jobId);
  else pending.set(jobId, next);
}

export function pendingEvaluations(jobId: string): number {
  return pending.get(jobId) ?? 0;
}
