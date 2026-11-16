import type { LockRules } from './agentRecord.js';
import type { LockFacts } from './autopilotGate.js';
import { lockedThisWeekMicros, locksToday, microsOf, otherLocks } from './lockLedger.js';

/// The facts the gate reads before an agent locks money alone (view 87),
/// built from plain values. Nothing here comes from a model. Pure.

export interface LockFactsInput {
  serverOn: boolean;
  agentOn: boolean;
  lock: boolean;
  stopped: boolean;
  family: boolean;
  rules: LockRules | null;
  /// The price plus the buyer's deal fee.
  totalUsdc: string;
  agreedUsdc: string;
  marketUsdc: number | null;
  outlierPct: number;
  timeZone: string;
  seller: { verified: boolean; settledDeals: number; upheldDisputes: number };
  jobId: string;
  now: number;
}

export function lockFacts(i: LockFactsInput): LockFacts {
  const others = otherLocks(i.rules?.locks ?? [], i.jobId);
  return {
    serverOn: i.serverOn,
    agentOn: i.agentOn,
    switches: { lock: i.lock },
    stopped: i.stopped,
    family: i.family,
    rules: i.rules
      ? { perDealMicros: microsOf(i.rules.perDeal.usdc), perWeekMicros: microsOf(i.rules.perWeek.usdc), perDay: i.rules.perDay, who: i.rules.who }
      : null,
    totalMicros: microsOf(i.totalUsdc),
    lockedThisWeekMicros: lockedThisWeekMicros(others, i.now),
    locksToday: locksToday(others, i.now, i.timeZone),
    seller: i.seller,
    agreedMicros: microsOf(i.agreedUsdc),
    marketMicros: i.marketUsdc !== null && i.marketUsdc > 0 ? microsOf(i.marketUsdc) : null,
    outlierPct: i.outlierPct,
  };
}
