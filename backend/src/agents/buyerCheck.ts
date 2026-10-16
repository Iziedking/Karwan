import type { RecordReadBody, ValueBand } from '../reputation/recordRead.js';
import { shouldSkipBuyer } from './shortlist.js';

/// What a seller's agent makes of a buyer from one paid record read, before it
/// bids. Pure: the same read and request always give the same verdict. The
/// seller sees this summary; the deal-by-deal read itself stays with the agent.

export type BuyerVerdict = 'bid' | 'review' | 'pass';
export type BuyerCheckReason = 'record-ok' | 'disputes' | 'mixed-record' | 'new-buyer-large' | 'first-at-this-size';

export interface BuyerCheck {
  verdict: BuyerVerdict;
  reason: BuyerCheckReason;
  score: number;
  tier: string;
  asBuyer: { completed: number; unsuccessful: number; repeatSellers: number; largestBand: ValueBand | null };
  disputesLost: number;
  paidUsdc: number;
  receipt: string | null;
  checkedAt: number;
  /// The read came back after the agent had already bid without it.
  late?: boolean;
}

const BANDS: readonly ValueBand[] = ['lt50', '50to250', '250to1000', 'gte1000'];
const LARGE_REQUEST_USDC = 250;

function bandOf(usdc: number): ValueBand {
  if (usdc < 50) return 'lt50';
  if (usdc < 250) return '50to250';
  if (usdc < 1000) return '250to1000';
  return 'gte1000';
}

export function assessBuyer(
  read: RecordReadBody,
  requestUsdc: number,
  payment: { paidUsdc: number; receipt: string | null; checkedAt: number },
): BuyerCheck {
  const buys = read.outcomes.filter((o) => o.role === 'buyer');
  const done = buys.filter((o) => o.success);
  const perSeller = new Map<string, number>();
  for (const o of done) perSeller.set(o.counterparty, (perSeller.get(o.counterparty) ?? 0) + 1);
  const largest = done.reduce<number>((max, o) => Math.max(max, BANDS.indexOf(o.valueBand)), -1);
  const asBuyer = {
    completed: done.length,
    unsuccessful: buys.length - done.length,
    repeatSellers: [...perSeller.values()].filter((n) => n > 1).length,
    largestBand: BANDS[largest] ?? null,
  };

  const large = requestUsdc >= LARGE_REQUEST_USDC;
  const [verdict, reason]: [BuyerVerdict, BuyerCheckReason] = shouldSkipBuyer(read.counts, false)
    ? ['pass', 'disputes']
    : asBuyer.unsuccessful > asBuyer.completed
      ? ['review', 'mixed-record']
      : large && asBuyer.completed === 0
        ? ['review', 'new-buyer-large']
        : large && largest < BANDS.indexOf(bandOf(requestUsdc))
          ? ['review', 'first-at-this-size']
          : ['bid', 'record-ok'];

  return {
    verdict,
    reason,
    score: read.score,
    tier: read.tier,
    asBuyer,
    disputesLost: read.counts.disputesLost,
    ...payment,
  };
}
