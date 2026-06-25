import { listDealsForAddress, type DirectDeal } from '../db/deals.js';
import { getBrief } from '../db/briefs.js';

/// A privacy-scoped "real work" record for a counterparty. The public passport
/// shows only an aggregate tier + score; this is the granular, DB-private view a
/// prospecting buyer pays the internal pull to see: the actual deals a seller
/// delivered, with outcome and recency. It never leaks the seller's PAST
/// counterparties or the exact private terms. Amounts are banded, no buyer
/// address, no jobId, no terms text, no delivery URL, only its type.

export type WorkOutcome = 'clean' | 'disputed' | 'failed';
export type DeliveryKind = 'code' | 'design' | 'file' | 'link' | null;

export interface WorkRow {
  category: string;
  amountBand: string;
  outcome: WorkOutcome;
  deliveredVia: DeliveryKind;
  ageLabel: string;
}

export interface WorkRecord {
  /// Deals the subject delivered as the seller, newest first. The real-work
  /// proof a buyer is vetting.
  rows: WorkRow[];
  summary: {
    total: number;
    clean: number;
    disputed: number;
    failed: number;
    avgBand: string;
    /// Headline numbers the public passport does not expose: share of delivered
    /// deals that settled clean, and the share delivered on or before deadline.
    /// Null when there is no basis (no terminal deals, or none with a deadline).
    completionRate: number | null;
    onTimeRate: number | null;
  };
  /// Lighter signal for the subject's buyer side, when they also buy.
  asBuyer: { funded: number; cleanRate: number | null };
}

/// Only terminal, seller-attributable outcomes count. Rep-neutral cancels
/// (mutual / platform / pre-accept) and in-progress deals are excluded so the
/// record reflects work actually delivered, not noise.
function outcomeOf(d: DirectDeal): WorkOutcome | null {
  if (d.cancelKind === 'mutual' || d.cancelKind === 'platform-attributed' || d.cancelKind === 'pre-accept') {
    return null;
  }
  if (d.cancelKind === 'unilateral' || d.cancelKind === 'refund-from-dispute') return 'failed';
  if (d.settledAt) return d.disputed ? 'disputed' : 'clean';
  if (d.disputed) return 'disputed';
  return null;
}

/// Relationship memory: how many deals THIS buyer has previously closed CLEAN
/// with THIS seller. The signal behind the buyer agent's small, earned nudge
/// toward a counterparty it has transacted with successfully before. Counts the
/// buyer->seller direction only ("I have bought from this seller and it went
/// clean"). Matched on OWNER addresses so the relationship survives either side
/// rotating its agent wallet, with the seller's bidding agent address as a
/// fallback when the owner link was never recorded on the old deal.
export async function countCleanDealsBetween(
  buyerOwner: string,
  sellerOwner: string | null,
  sellerAgentAddress: string | null,
): Promise<number> {
  const b = buyerOwner.toLowerCase();
  const sOwner = sellerOwner?.toLowerCase() ?? null;
  const sAgent = sellerAgentAddress?.toLowerCase() ?? null;
  if (!sOwner && !sAgent) return 0;
  const deals = await listDealsForAddress(buyerOwner);
  return deals.filter((d) => {
    if (d.buyer.toLowerCase() !== b) return false;
    const sellerMatches =
      (sOwner !== null && d.seller.toLowerCase() === sOwner) ||
      (sAgent !== null && d.sellerAgentAddress?.toLowerCase() === sAgent);
    return sellerMatches && outcomeOf(d) === 'clean';
  }).length;
}

/// Coarse amount band so scale shows without revealing the exact private price.
function band(usdc: string): string {
  const n = Number(usdc);
  if (!Number.isFinite(n) || n <= 0) return '~$0';
  let r: number;
  if (n < 100) r = Math.round(n / 10) * 10;
  else if (n < 500) r = Math.round(n / 50) * 50;
  else if (n < 2000) r = Math.round(n / 250) * 250;
  else r = Math.round(n / 1000) * 1000;
  return `~$${r}`;
}

function deliveryKind(proof?: string): DeliveryKind {
  if (!proof) return null;
  const p = proof.toLowerCase();
  if (/github|gitlab|bitbucket|npmjs|pypi|crates\.io/.test(p)) return 'code';
  if (/figma|dribbble|behance|canva/.test(p)) return 'design';
  if (/drive\.google|dropbox|ipfs|\.zip|\.pdf|\.docx?|\.xlsx?/.test(p)) return 'file';
  return 'link';
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/// Short category from the request keywords (high-level, never the full terms),
/// falling back to the trade type.
function categoryLabel(d: DirectDeal): string {
  const kws = getBrief(d.jobId)?.keywords;
  if (kws && kws.length > 0) return titleCase(kws.slice(0, 2).join(' '));
  return d.tradeType === 'goods' ? 'Goods' : d.tradeType === 'mixed' ? 'Goods + service' : 'Service';
}

function ageLabel(ts: number, now: number): string {
  const days = Math.max(0, Math.floor((now - ts) / 86_400_000));
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function terminalAt(d: DirectDeal): number {
  return d.settledAt ?? d.disputedAt ?? d.cancelledAt ?? d.createdAt;
}

export async function buildWorkRecord(subject: string, now = Date.now()): Promise<WorkRecord> {
  const s = subject.toLowerCase();
  const deals = await listDealsForAddress(s);

  const sellerDeals = deals
    .filter((d) => d.seller.toLowerCase() === s)
    .map((d) => ({ d, outcome: outcomeOf(d) }))
    .filter((x): x is { d: DirectDeal; outcome: WorkOutcome } => x.outcome !== null)
    .sort((a, b) => terminalAt(b.d) - terminalAt(a.d));

  const rows: WorkRow[] = sellerDeals.map(({ d, outcome }) => ({
    category: categoryLabel(d),
    amountBand: band(d.dealAmountUsdc),
    outcome,
    deliveredVia: deliveryKind(d.deliveryProof),
    ageLabel: ageLabel(terminalAt(d), now),
  }));

  const clean = sellerDeals.filter((x) => x.outcome === 'clean').length;
  const disputed = sellerDeals.filter((x) => x.outcome === 'disputed').length;
  const failed = sellerDeals.filter((x) => x.outcome === 'failed').length;
  const total = sellerDeals.length;
  const avgAmount =
    total > 0
      ? sellerDeals.reduce((sum, x) => sum + (Number(x.d.dealAmountUsdc) || 0), 0) / total
      : 0;

  // On-time: of the delivered deals that carried a deadline, how many were
  // delivered on or before it. deliveredAt is ms, deadlineUnix is seconds.
  const withDeadline = sellerDeals.filter(({ d }) => d.deliveredAt && d.deadlineUnix);
  const onTime = withDeadline.filter(
    ({ d }) => (d.deliveredAt as number) <= (d.deadlineUnix as number) * 1000,
  ).length;
  const completionRate = total > 0 ? Math.round((clean / total) * 100) : null;
  const onTimeRate =
    withDeadline.length > 0 ? Math.round((onTime / withDeadline.length) * 100) : null;

  // Buyer side: terminal deals the subject funded, and how many settled clean.
  const buyerDeals = deals
    .filter((d) => d.buyer.toLowerCase() === s)
    .map((d) => ({ d, outcome: outcomeOf(d) }))
    .filter((x) => x.outcome !== null);
  const funded = buyerDeals.length;
  const buyerClean = buyerDeals.filter((x) => x.outcome === 'clean').length;

  return {
    rows,
    summary: {
      total,
      clean,
      disputed,
      failed,
      avgBand: band(String(avgAmount)),
      completionRate,
      onTimeRate,
    },
    asBuyer: { funded, cleanRate: funded > 0 ? Math.round((buyerClean / funded) * 100) : null },
  };
}
