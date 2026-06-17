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
import { getLinkOffenseCount } from '../security/linkOffenses.js';

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
  /// Counterparty concentration over the last 20 deals: ratio of the
  /// top counterparty's deal count to total. 0 when the wallet has no
  /// settled deals; 1 when every deal is with the same counterparty.
  /// Used by the buyer agent's trust signal (soft flag >= 60%, hard
  /// flag >= 80%) and the credit passport surface.
  concentrationRatio: number;
  /// True when concentrationRatio >= 60%. UI surfaces a soft warning;
  /// the buyer agent drops its trust signal by 0.2.
  concentrationSoft: boolean;
  /// True when concentrationRatio >= 80%. Buyer agent forces
  /// humanReview regardless of tier.
  concentrationHard: boolean;
  /// Count of flagged-link offenses (delivery proof or chat) recorded against
  /// this wallet by the Security Agent. Feeds the heaviest penalty term; one
  /// offense alone drops the score hard.
  securityOffenses: number;
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
  /// Dispute resolutions where this wallet was the loser. Drives an off-chain
  /// rep penalty that matches the on-chain Failed signal for trusted deals.
  /// For casual deals (no reservation), the chain records nothing, so this is
  /// the only signal that exists. For trusted deals the on-chain failedCount
  /// already covers refund losses; we still count releases here so the buyer's
  /// concession on a release-from-dispute lands somewhere.
  let disputeLossesOffchain = 0;
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
    /// Dispute-state resolutions credit a loss to whichever side conceded.
    /// 'refund-from-dispute' marks seller; 'release-from-dispute' marks buyer.
    /// The route writes disputeLoser at accept time; trust it here.
    ///
    /// Avoid double-counting against the on-chain failedCount:
    /// - Seller loss on a TRUSTED deal already lands on chain via refund() →
    ///   recordCompletion(Failed). Skip it off-chain.
    /// - Seller loss on a CASUAL deal has no on-chain hit. Count it here.
    /// - Buyer loss (release-from-dispute) is never on-chain. The contract
    ///   records DisputeResolved for both, never Failed against the buyer.
    ///   Always count it off-chain.
    const loserRole = d.disputeLoser;
    if (loserRole) {
      const loserAddress = loserRole === 'buyer' ? buyer : seller;
      if (loserAddress === address) {
        const isTrusted = !!d.requireStake;
        const alreadyOnChain = loserRole === 'seller' && isTrusted;
        if (!alreadyOnChain) disputeLossesOffchain += 1;
      }
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
      concentrationRatio: 0,
      concentrationSoft: false,
      concentrationHard: false,
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

  /// Roll off-chain dispute losses into the same failedCount the engine
  /// already penalises. The per-deal loop above skips losses already
  /// recorded on-chain (trusted-deal seller refunds), so adding the two
  /// counts here does not double-count. What lives off-chain:
  ///   - Casual-deal seller refunds (no reservation, no chain hit).
  ///   - All buyer release-from-dispute concessions (chain never records
  ///     Failed against a buyer).
  const failedCountTotal = chain.failedCount + disputeLossesOffchain;

  return {
    address,
    successCount: chain.successCount,
    disputedCount: chain.disputedCount,
    failedCount: failedCountTotal,
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
    ...computeConcentration(address, deals),
    securityOffenses: getLinkOffenseCount(address),
  };
}

/// Concentration over the last 20 settled deals (sme-research.md §9):
///   - top counterparty's deal count / total
///   - soft flag at 60%, hard flag at 80%
/// Returns zero ratios + false flags on too-few-deals (< 3) so a
/// brand-new wallet doesn't trip on its first repeat counterparty.
function computeConcentration(
  address: string,
  deals: ReadonlyArray<{ buyer: string; seller: string; settledAt?: number }>,
): { concentrationRatio: number; concentrationSoft: boolean; concentrationHard: boolean } {
  const mine = deals.filter((d) => {
    const b = d.buyer?.toLowerCase();
    const s = d.seller?.toLowerCase();
    return (b === address || s === address) && !!d.settledAt;
  });
  if (mine.length < 3) {
    return { concentrationRatio: 0, concentrationSoft: false, concentrationHard: false };
  }
  const window = mine.slice(-20);
  const counts = new Map<string, number>();
  for (const d of window) {
    const cp = d.buyer.toLowerCase() === address ? d.seller.toLowerCase() : d.buyer.toLowerCase();
    counts.set(cp, (counts.get(cp) ?? 0) + 1);
  }
  let top = 0;
  for (const c of counts.values()) {
    if (c > top) top = c;
  }
  const ratio = top / window.length;
  return {
    concentrationRatio: ratio,
    concentrationSoft: ratio >= 0.6,
    concentrationHard: ratio >= 0.8,
  };
}

/// Score-aggregation history:
///   - Pre-v2.E: KarwanReputation.recordCompletion was called with AGENT
///     wallet addresses for buyer + seller. Scores accumulated on each
///     agent's address; the identity address read zero.
///   - v2.E (task #257, "Escrow: per-deal reservationBps + identity
///     resolve"): the escrow now resolves agents back to identity BEFORE
///     calling recordCompletion. New deals credit the identity address;
///     reads against the identity return the real count.
///
/// Both shapes coexist on chain: a wallet active across both generations
/// has some credits on agents and some on identity. Summing identity +
/// buyer agent + seller agent covers every history slice with no double-
/// counting (a single deal fires CompletionRecorded once, against EITHER
/// identity OR agent depending on which generation settled it).
async function readChainScores(
  address: string,
): Promise<{ successCount: number; disputedCount: number; failedCount: number }> {
  const wallets = await getAgentWallets(address).catch(() => null);
  // Identity ALWAYS in the target set. That's where v2.E+ credits land.
  const targets: string[] = [address];
  if (wallets?.buyerAddress && wallets.buyerAddress.toLowerCase() !== address.toLowerCase()) {
    targets.push(wallets.buyerAddress);
  }
  if (wallets?.sellerAddress && wallets.sellerAddress.toLowerCase() !== address.toLowerCase()) {
    targets.push(wallets.sellerAddress);
  }

  const reads = await Promise.all(targets.map(readSingleScores));
  return reads.reduce(
    (acc, r) => ({
      successCount: acc.successCount + r.successCount,
      disputedCount: acc.disputedCount + r.disputedCount,
      failedCount: acc.failedCount + r.failedCount,
    }),
    { successCount: 0, disputedCount: 0, failedCount: 0 },
  );
}

async function readSingleScores(
  target: string,
): Promise<{ successCount: number; disputedCount: number; failedCount: number }> {
  try {
    const scores = (await reputation.read.scores([target as `0x${string}`])) as readonly [
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
      { err: (err as Error).message, address: target },
      'reputation chain read failed for one target, contributing zeros',
    );
    return { successCount: 0, disputedCount: 0, failedCount: 0 };
  }
}
