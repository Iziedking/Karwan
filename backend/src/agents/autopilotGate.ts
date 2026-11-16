import type { Alone } from './alone.js';

/// Whether an agent may lock the money for a deal it agreed, without its
/// person's tap (view 87). Pure: it takes facts and reads nothing, and no
/// answer from a model is among the facts. Anything but yes becomes a question
/// to the person or stops the agent; nothing here moves money.

export type LockRefusal =
  | 'server-off'
  | 'agent-off'
  | 'switch-off'
  | 'stopped'
  | 'not-family'
  | 'over-deal'
  | 'over-week'
  | 'over-day'
  | 'who'
  | 'price-outlier';

export type LockWho = 'record' | 'verified' | 'anyone';

export interface LockRules {
  perDealMicros: bigint;
  perWeekMicros: bigint;
  perDay: number;
  who: LockWho;
}

export interface LockFacts {
  /// AUTOPILOT_LOCK_ENABLED on this network.
  serverOn: boolean;
  agentOn: boolean;
  /// The switches as the person set them.
  switches: Pick<Alone, 'lock'>;
  stopped: boolean;
  /// The deal is on the escrow family. Nothing else may be funded alone.
  family: boolean;
  rules: LockRules | null;
  /// Everything the lock takes from the person: the price, the deal fee and the match fee.
  totalMicros: bigint;
  lockedThisWeekMicros: bigint;
  locksToday: number;
  seller: { verified: boolean; settledDeals: number; upheldDisputes: number };
  agreedMicros: bigint;
  /// Karwan's market price for this work, when it has one.
  marketMicros: bigint | null;
  /// How far above the market price an agreed price may be, in percent.
  outlierPct: number;
}

export type LockDecision = { ok: true } | { ok: false; reason: LockRefusal };

const no = (reason: LockRefusal): LockDecision => ({ ok: false, reason });

function passesWho(who: LockWho, seller: LockFacts['seller']): boolean {
  if (who === 'anyone') return true;
  if (seller.verified) return true;
  return who === 'record' && seller.settledDeals > 0 && seller.upheldDisputes === 0;
}

export function mayLock(f: LockFacts): LockDecision {
  if (!f.serverOn) return no('server-off');
  if (!f.agentOn) return no('agent-off');
  if (!f.switches.lock || !f.rules) return no('switch-off');
  if (f.stopped) return no('stopped');
  if (!f.family) return no('not-family');
  if (f.totalMicros <= 0n || f.totalMicros > f.rules.perDealMicros) return no('over-deal');
  if (f.lockedThisWeekMicros + f.totalMicros > f.rules.perWeekMicros) return no('over-week');
  if (f.locksToday >= f.rules.perDay) return no('over-day');
  if (!passesWho(f.rules.who, f.seller)) return no('who');
  if (f.marketMicros !== null && f.marketMicros > 0n) {
    const ceiling = (f.marketMicros * BigInt(100 + Math.max(0, Math.floor(f.outlierPct)))) / 100n;
    if (f.agreedMicros > ceiling) return no('price-outlier');
  }
  return { ok: true };
}

/// What the agent does with a refusal: it stops itself, or asks its person.
export function afterRefusal(reason: LockRefusal): 'stop' | 'ask' {
  return reason === 'not-family' || reason === 'over-day' ? 'stop' : 'ask';
}
