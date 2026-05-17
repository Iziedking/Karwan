/// Reads every input the reputation engine needs from chain + DB. Each
/// function is independent so tests can stub one source at a time. The shape
/// returned here is what `compute()` in engine.ts consumes.

import { reputation } from '../chain/contracts.js';
import { listAllDeals } from '../db/deals.js';
import { logger } from '../logger.js';
import { tenureWeightedStakeUsdc } from './stake.js';
import { computeSpamSignals, type SpamBreakdown } from './spam.js';

export interface ReputationInputs {
  /// Lowercased subject address.
  address: string;
  /// On-chain success count from KarwanReputation.
  successCount: number;
  /// On-chain dispute-resolved count. Treated as neutral, not a penalty.
  disputedCount: number;
  /// On-chain failure count. Used in disputesLostRate.
  failedCount: number;
  /// Total deals where this wallet is buyer or seller (from local DB).
  /// Includes settled, cancelled, expired, in-flight.
  totalStarted: number;
  /// Deals settled (state === 2). Drives activityTerm + completionTerm.
  completedDeals: number;
  /// Deals cancelled in the last 90 days. Drives cancelRate.
  cancelsLast90d: number;
  /// First on-chain action timestamp (epoch ms). Used by timeTerm + decay.
  /// 0 when the address has never opened a deal.
  firstActionAt: number;
  /// Last on-chain action timestamp. Used for the decay multiplier.
  lastActionAt: number;
  /// Sum of (principal × min(1, tenureDays / 365)) over Active vault
  /// positions, in USDC. Zero when KarwanVault is not yet deployed or the
  /// indexer has no entries for this address.
  tenureWeightedStakeUsdc: number;
  /// Spam score in [0, 1]. Sum of the three signal contributions from the
  /// spam detector (burst, low counterparty diversity, match-and-cancel rate).
  spamScore: number;
  /// Per-signal breakdown so the UI can show which spam rule tripped and how
  /// to clear it. Always populated even when the total score is zero.
  spamBreakdown: SpamBreakdown;
  /// Counter-abandon rate in [0, 1] over 90 days.
  counterAbandonRate: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * MS_PER_DAY;

/// Aggregate all inputs needed for one subject. Each leg is wrapped so a
/// transient failure on one source doesn't take down the whole computation.
export async function loadInputs(addressRaw: string): Promise<ReputationInputs> {
  const address = addressRaw.toLowerCase();

  const chain = await readChainScores(address).catch(() => ({
    successCount: 0,
    disputedCount: 0,
    failedCount: 0,
  }));

  const deals = await listAllDeals().catch(() => []);
  const now = Date.now();
  let totalStarted = 0;
  let completedDeals = 0;
  let cancelsLast90d = 0;
  let firstActionAt = 0;
  let lastActionAt = 0;
  for (const d of deals) {
    const buyer = d.buyer?.toLowerCase();
    const seller = d.seller?.toLowerCase();
    if (buyer !== address && seller !== address) continue;
    totalStarted += 1;
    if (d.settledAt) completedDeals += 1;
    if (d.cancelledAt && d.cancelledAt > now - NINETY_DAYS_MS) cancelsLast90d += 1;
    const created = d.createdAt ?? 0;
    if (created > 0 && (firstActionAt === 0 || created < firstActionAt)) firstActionAt = created;
    const last = d.updatedAt ?? d.settledAt ?? d.cancelledAt ?? created;
    if (last > lastActionAt) lastActionAt = last;
  }

  // The on-chain success count is the canonical settlement signal. Prefer it
  // over the DB count when it's higher (the DB can lag behind the chain).
  completedDeals = Math.max(completedDeals, chain.successCount);

  const [stake, spam] = await Promise.all([
    tenureWeightedStakeUsdc(address).catch(() => 0),
    computeSpamSignals(address).catch(() => ({
      spamScore: 0,
      breakdown: { burst: 0, diversity: 0, matchAndCancel: 0 },
      counterAbandonRate: 0,
    })),
  ]);

  return {
    address,
    successCount: chain.successCount,
    disputedCount: chain.disputedCount,
    failedCount: chain.failedCount,
    totalStarted,
    completedDeals,
    cancelsLast90d,
    firstActionAt,
    lastActionAt,
    tenureWeightedStakeUsdc: stake,
    spamScore: spam.spamScore,
    spamBreakdown: spam.breakdown,
    counterAbandonRate: spam.counterAbandonRate,
  };
}

async function readChainScores(
  address: string,
): Promise<{ successCount: number; disputedCount: number; failedCount: number }> {
  try {
    const scores = (await reputation.read.scores([address as `0x${string}`])) as readonly [
      bigint,
      bigint,
      bigint,
    ];
    return {
      successCount: Number(scores[0]),
      disputedCount: Number(scores[1]),
      failedCount: Number(scores[2]),
    };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, address },
      'reputation chain read failed, defaulting to zeros',
    );
    return { successCount: 0, disputedCount: 0, failedCount: 0 };
  }
}
