/// How long a request waits for the first fitting seller's agent to decide
/// (view 41, measure 1). Recorded in memory per request: when it was posted
/// and when the first seller evaluation on it finished, an offer, a question
/// or a pass. The target is 10 seconds at the 95th percentile on testnet; it
/// is measured here and not claimed until it is.

export interface MatchTiming {
  jobId: string;
  postedAt: number;
  decidedAt: number | null;
}

export interface LatencySummary {
  decided: number;
  waiting: number;
  p50Ms: number | null;
  p95Ms: number | null;
  recent: Array<{ jobId: string; ms: number }>;
}

const KEEP = 200;
const timings = new Map<string, MatchTiming>();

export function recordPosted(jobId: string, postedAt: number): void {
  const key = jobId.toLowerCase();
  if (timings.has(key)) return;
  timings.set(key, { jobId: key, postedAt, decidedAt: null });
  if (timings.size > KEEP) timings.delete(timings.keys().next().value!);
}

/// The first decision counts; later sellers on the same request do not move it.
export function recordDecision(jobId: string, decidedAt: number): void {
  const t = timings.get(jobId.toLowerCase());
  if (!t || t.decidedAt !== null) return;
  t.decidedAt = Math.max(decidedAt, t.postedAt);
}

export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const at = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[at]!;
}

export function summarise(all: readonly MatchTiming[]): LatencySummary {
  const decided = all.filter((t): t is MatchTiming & { decidedAt: number } => t.decidedAt !== null);
  const ms = decided.map((t) => t.decidedAt - t.postedAt).sort((a, b) => a - b);
  return {
    decided: decided.length,
    waiting: all.length - decided.length,
    p50Ms: percentile(ms, 50),
    p95Ms: percentile(ms, 95),
    recent: decided.slice(-10).map((t) => ({ jobId: t.jobId, ms: t.decidedAt - t.postedAt })),
  };
}

export function matchLatencySummary(): LatencySummary {
  return summarise([...timings.values()]);
}

/// Tests only.
export function resetMatchLatency(): void {
  timings.clear();
}
