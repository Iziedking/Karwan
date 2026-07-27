import { config } from '../config.js';
import type { DirectDeal } from '../db/deals.js';

/// Release timing, shared by the unattended path and the seller's claim.
///
/// This lives here rather than in dealWatcher because BOTH paths have to agree.
/// When the floor existed only in the watcher, a Net 30 goods deal held off
/// auto-release for thirty days and the seller could still force payout on day
/// one by pressing Claim. The buyer's protection was one button wide.

const DAY_MS = 86_400_000;

/// How long the payment terms say the buyer's money is theirs to hold.
///
/// Net terms are not decoration. A buyer who agreed Net 30 agreed settlement
/// happens thirty days after delivery, and paying out on day one hands the
/// seller the money while the buyer still has every right to inspect.
///
/// Goods with no explicit terms get the transit floor instead, because
/// "delivered" on physical goods means DISPATCHED. The seller marks it when the
/// container leaves and nothing has arrived for the buyer to look at. Once the
/// buyer confirms arrival that reason is gone and the floor lifts.
///
/// Services are excluded: a delivery there is a link the buyer opens at once.
export function termsFloorMs(deal: DirectDeal): number {
  switch (deal.paymentTerms) {
    case 'net90':
      return 90 * DAY_MS;
    case 'net60':
      return 60 * DAY_MS;
    case 'net30':
      return 30 * DAY_MS;
    default:
      break;
  }
  if (deal.tradeType === 'goods' || deal.tradeType === 'mixed') {
    if (deal.shipment?.arrivedAt) return 0;
    return config.GOODS_TRANSIT_FLOOR_MS;
  }
  return 0;
}

/// Bigger deals earn more review time, saturating so one large deal cannot park
/// an escrow indefinitely.
export function amountFactor(deal: DirectDeal): number {
  const amount = Number(deal.dealAmountUsdc);
  if (!Number.isFinite(amount) || amount <= 0) return 1;
  return Math.min(config.AUTO_RELEASE_MAX_AMOUNT_FACTOR, 1 + amount / config.AUTO_RELEASE_AMOUNT_REF_USDC);
}

/// A counterparty you have settled with before needs less scrutiny than a
/// stranger. Only ever lengthens; trust shortens it back toward the base ladder.
export function historyFactor(priorSettledTogether: number): number {
  if (priorSettledTogether >= 3) return 1;
  if (priorSettledTogether >= 1) return 1.5;
  return 2;
}

/// The window for the milestone at `index`.
///
/// Deliberately NOT a function of anything resembling quality. The contract
/// cannot observe whether the work was any good, and a timer that pretended to
/// would just be a slower way of guessing.
export function autoReleaseWindowMs(
  deal: DirectDeal,
  index: number,
  priorSettledTogether: number,
): number {
  const ladder = config.DEAL_REVIEW_WINDOW_MS * 2 ** index;
  const scaled = ladder * amountFactor(deal) * historyFactor(priorSettledTogether);
  return Math.max(scaled, termsFloorMs(deal));
}

/// When the window on the current milestone opens for payout, or null when the
/// deal has not been delivered yet.
///
/// The anchor mirrors the watcher: the first milestone runs from delivery, later
/// ones from the last release.
export function releaseEligibleAt(
  deal: DirectDeal,
  index: number,
  priorSettledTogether: number,
): number | null {
  const anchor =
    index === 0
      ? deal.deliveredAt
      : (deal.lastReleaseAt ?? deal.reviewWindowStartedAt ?? deal.deliveredAt);
  if (!anchor) return null;
  return anchor + autoReleaseWindowMs(deal, index, priorSettledTogether);
}

/// Order-independent pair key, so a pair reads the same whichever side is buying.
export function pairKey(a: string, b: string): string {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `${x}:${y}`;
}

/// Settled deals between the same two parties.
export function buildPairHistory(deals: DirectDeal[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of deals) {
    if (!d.settledAt) continue;
    const key = pairKey(d.buyer, d.seller);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
