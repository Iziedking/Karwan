/// Reads every input the reputation engine needs from chain + DB. Each
/// function is independent so tests can stub one source at a time. The shape
/// returned here is what `compute()` in engine.ts consumes.

import { reputation } from '../chain/contracts.js';
import { listAllDeals } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { logger } from '../logger.js';
import { activeStakeSummary } from './stake.js';
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
  /// Raw active staked principal in USDC (not tenure-divided). Drives the stake
  /// factor's magnitude. Zero when nothing is staked or the vault isn't set.
  stakeUsdc: number;
  /// Longest-held active position's age in days. Drives the stake duration ramp.
  stakeDays: number;
  /// Registration timestamp (epoch ms): profile creation, else agent activation,
  /// else first on-chain action. Drives the tenure factor.
  registeredAt: number;
  /// Distinct calendar days (UTC) the wallet took a deal action. Drives the
  /// active-days factor. Proxy from deal timestamps until a precise tracker ships.
  activeDays: number;
  /// Lifetime USDC settled through escrow on this wallet's deals. Drives volume.
  lifetimeVolumeUsdc: number;
  /// Count of wallets that registered via a direct deal with this user. Drives
  /// the referral factor. 0 until referral attribution is built (see todo.md).
  referredCount: number;
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
  let lifetimeVolumeUsdc = 0;
  // Distinct UTC day buckets the wallet touched a deal. Proxy for "active days"
  // until a dedicated action tracker lands (see todo.md).
  const activeDayBuckets = new Set<number>();
  const bucket = (ts: number) => Math.floor(ts / MS_PER_DAY);
  for (const d of deals) {
    const buyer = d.buyer?.toLowerCase();
    const seller = d.seller?.toLowerCase();
    if (buyer !== address && seller !== address) continue;
    totalStarted += 1;
    if (d.settledAt) {
      completedDeals += 1;
      lifetimeVolumeUsdc += Number(d.dealAmountUsdc) || 0;
    }
    // Only rep-affecting cancels count toward the penalty. Per the cancellation
    // taxonomy (db/deals.ts), 'mutual', 'platform-attributed' and 'pre-accept'
    // are rep-neutral; only a 'unilateral' cancel (buyer reclaimed after the
    // deadline lapsed) counts. Legacy rows with no cancelKind were the original
    // unilateral /cancel path, so treat undefined as unilateral.
    const repAffectingCancel = d.cancelKind === 'unilateral' || d.cancelKind == null;
    if (d.cancelledAt && d.cancelledAt > now - NINETY_DAYS_MS && repAffectingCancel) {
      cancelsLast90d += 1;
    }
    const created = d.createdAt ?? 0;
    if (created > 0) {
      if (firstActionAt === 0 || created < firstActionAt) firstActionAt = created;
      activeDayBuckets.add(bucket(created));
    }
    const last = d.updatedAt ?? d.settledAt ?? d.cancelledAt ?? created;
    if (last > lastActionAt) lastActionAt = last;
    if (last > 0) activeDayBuckets.add(bucket(last));
  }

  // The on-chain reputation contract is the source of truth for settled-deal
  // credit. The DB tracks settlement intent (it advances when the backend
  // marks settledAt) but a chain-side recordCompletion call can fail silently
  // (network blip, contract redeploy, missing buyerAgentWalletId, etc.), so a
  // wallet can show "N settled in DB / 0 recorded on chain". Crediting the DB
  // count in that window inflates the score against an unverified history.
  //
  // Rule: completion + volume are gated by chain. DB-only settlements earn
  // ZERO completion credit and ZERO volume credit until backfilled on chain.
  // Once recordCompletion fires for a jobId, both factors include it
  // automatically. dbSettled is preserved for diagnostics + UI surfaces that
  // want to show the gap (e.g. "12 settled locally, 7 verified on chain").
  const dbSettled = completedDeals;
  completedDeals = chain.successCount;
  if (dbSettled > 0 && chain.successCount === 0) {
    // No chain credit at all → volume contribution is zero. Don't reward an
    // address for transactions the reputation contract never witnessed.
    lifetimeVolumeUsdc = 0;
  } else if (dbSettled > chain.successCount) {
    // Partial credit. Pro-rate the volume by the chain/db ratio so volume
    // tracks the verified subset. A future iteration can walk
    // CompletionRecorded events to map each chain-recorded settlement back
    // to its dealAmountUsdc precisely; the ratio is the pragmatic stand-in.
    const ratio = chain.successCount / dbSettled;
    lifetimeVolumeUsdc = lifetimeVolumeUsdc * ratio;
  }

  const [stake, spam, profile, wallets] = await Promise.all([
    activeStakeSummary(address).catch(() => ({ stakeUsdc: 0, stakeDays: 0 })),
    computeSpamSignals(address).catch(() => ({
      spamScore: 0,
      breakdown: { burst: 0, diversity: 0, matchAndCancel: 0 },
      counterAbandonRate: 0,
    })),
    getProfile(address).catch(() => null),
    getAgentWallets(address).catch(() => null),
  ]);

  // Registration age: profile creation is the truest "joined" signal; fall back
  // to agent activation, then to the first deal so an account with neither still
  // accrues tenure.
  const registeredAt = profile?.createdAt ?? wallets?.createdAt ?? firstActionAt;

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
    stakeUsdc: stake.stakeUsdc,
    stakeDays: stake.stakeDays,
    registeredAt,
    activeDays: activeDayBuckets.size,
    lifetimeVolumeUsdc,
    referredCount: 0,
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
