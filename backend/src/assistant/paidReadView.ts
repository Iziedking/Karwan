/// What the assistant may repeat from a paid record read. The assistant talks
/// to a person, so once records are sealed it gets how the other person is
/// verified and their tier, never their numbers (D30).
export function paidReadView(
  read: { level: string; tier: string; score: number; counts: { completed: number; onTimeRate: number | null } },
  paidUsdc: number,
  proofTx: string | null,
  sealed: boolean,
) {
  if (sealed) return { level: read.level, tier: read.tier, paidUsdc, proofTx };
  return { score: read.score, completedDeals: read.counts.completed, onTimePercent: read.counts.onTimeRate, paidUsdc, proofTx };
}
