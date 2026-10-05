import type { NotifyCopy } from '@/shared/i18n/messages/notifications';
import { tradeTypeOf } from '@/shared/deals/tradeVocabulary';

type Role = 'buyer' | 'seller' | 'financier';

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/// Drops trailing zeros from a USDC amount: "25.000000" reads "25".
export function trimUsdc(raw: string): string {
  if (!raw.includes('.')) return raw;
  const trimmed = raw.replace(/\.?0+$/, '');
  return trimmed.length === 0 ? '0' : trimmed;
}

const PAUSE_KEYS: Record<string, keyof NotifyCopy['pausedWhy']> = {
  'evidence-mismatch': 'evidenceMismatch',
  'check-pending': 'checkPending',
  'check-expired': 'checkExpired',
  'terms-changed': 'termsChanged',
  'delivery-replaced': 'deliveryReplaced',
  'link-unverifiable': 'linkUnverifiable',
};

/// The bell's one line for an event, in the reader's language, from the same
/// facts the deal page and the deal chat use.
export function summaryFor(
  type: string,
  payload: Record<string, unknown> | undefined,
  role: Role | null,
  c: NotifyCopy,
): string {
  const str = (key: string) => {
    const v = payload?.[key];
    return v === undefined || v === null ? '' : String(v);
  };
  const price = str('agreedPriceUsdc');
  const amount = str('dealAmountUsdc');
  const reason = str('reason');
  const trade = tradeTypeOf(payload?.tradeType);
  const seller = role === 'seller';
  const pick = (withValue: string, without: string, values: Record<string, string | number>) =>
    Object.values(values).every((v) => v !== '') ? fill(withValue, values) : without;

  switch (type) {
    case 'deal.matched':
      return seller ? pick(c.matchedSellerPrice, c.matchedSeller, { price }) : pick(c.matchedBuyerPrice, c.matchedBuyer, { price });
    case 'deal.match.approved':
      return seller ? pick(c.approvedSellerPrice, c.approvedSeller, { price }) : pick(c.approvedBuyerPrice, c.approvedBuyer, { price });
    case 'deal.match.declined':
      return seller ? c.declinedSeller : c.declinedBuyer;
    case 'deal.match.raised':
      return pick(c.raisedPrice, c.raised, { price: str('raisedPriceUsdc') });
    case 'job.expired':
      return c.jobExpired;
    case 'listing.matched':
      return pick(c.listingMatchedPrice, c.listingMatched, { price: str('askingPriceUsdc') });
    case 'trend.match':
      return pick(c.trendKeyword, c.trend, { keyword: str('keyword') });
    case 'agent.declined':
      return pick(c.agentDeclinedReason, c.agentDeclined, { reason });
    case 'negotiation.near-miss': {
      const values = { price: str('proceedPriceUsdc'), gap: str('gapUsdc') };
      return seller ? pick(c.nearMissSellerPrice, c.nearMissSeller, values) : pick(c.nearMissBuyerPrice, c.nearMissBuyer, values);
    }
    case 'deal.direct.created':
      return pick(c.directCreatedAmount, c.directCreated, { amount });
    case 'deal.invite.claimed':
      return pick(c.inviteClaimedAmount, c.inviteClaimed, { amount });
    case 'offer.created':
      return pick(c.offerCreatedPrice, c.offerCreated, { price: str('priceUsdc') });
    case 'deal.direct.edited':
      return payload?.countered
        ? pick(c.editedBySellerAmount, c.editedBySeller, { amount })
        : pick(c.editedByBuyerAmount, c.editedByBuyer, { amount });
    case 'deal.seller-approved':
      return c.sellerApproved;
    case 'deal.direct.declined':
      return c.directDeclined;
    case 'deal.accepted':
      return seller ? c.acceptedSeller[trade] : c.acceptedBuyer[trade];
    case 'deal.delivered':
      return c.delivered[trade];
    case 'deal.delivery.flagged':
      return seller ? c.flaggedSeller : c.flaggedBuyer;
    case 'deal.delivery.cleared':
      return seller ? c.clearedSeller : c.clearedBuyer[trade];
    case 'deal.release.blocked': {
      const detail = str('detail');
      const why = c.pausedWhy;
      const text =
        detail === 'security-hold' ? (seller ? why.securityHoldSeller : why.securityHold)
        : detail === 'off-request' ? (seller ? why.offRequestSeller : why.offRequest)
        : PAUSE_KEYS[detail] ? why[PAUSE_KEYS[detail]]
        : why.fallback;
      return fill(c.paused, { reason: text });
    }
    case 'deal.fund.insufficient':
      return c.fundInsufficient;
    case 'escrow.milestone.released':
      return seller ? c.releasedSeller : c.released;
    case 'deal.review.started':
      return c.reviewStarted;
    case 'deal.deadline.passed':
      return c.deadlinePassed;
    case 'deal.review.heartbeat':
      return c.heartbeat;
    case 'deal.auto_released':
      return seller ? c.autoReleasedSeller : c.autoReleased;
    case 'escrow.settled':
      return c.settled;
    case 'deal.disputed':
      return c.disputed;
    case 'escrow.resolved': {
      const bps = typeof payload?.sellerBps === 'number' ? payload.sellerBps : null;
      if (bps === null) return c.resolved;
      if (bps === 0) return c.resolvedRefund;
      if (bps >= 10000) return c.resolvedSeller;
      return fill(c.resolvedSplit, { pct: bps / 100 });
    }
    case 'deal.cancelled':
      return c.cancelled;
    case 'deal.cancel.proposed':
      return pick(c.cancelProposedReason, c.cancelProposed, { reason: reason.slice(0, 60) });
    case 'deal.cancel.declined':
      return c.cancelDeclined;
    case 'wallet.credited':
    case 'wallet.debited': {
      const role = str('walletRole');
      const label = str('walletLabel') || (role === 'buyerAgent' ? c.wallets.buyerAgent : role === 'sellerAgent' ? c.wallets.sellerAgent : c.wallets.wallet);
      return fill(type === 'wallet.credited' ? c.credited : c.debited, { amount: trimUsdc(str('amountUsdc') || '0'), label });
    }
    case 'vault.deposit':
      return fill(c.staked, { amount: trimUsdc(str('amountUsdc') || '0') });
    case 'vault.withdraw.requested':
      return pick(c.cooldownStartedAmount, c.cooldownStarted, { amount: trimUsdc(str('principalUsdc')) });
    case 'vault.withdraw.cancelled':
      return pick(c.cooldownCancelledAmount, c.cooldownCancelled, { amount: trimUsdc(str('principalUsdc')) });
    case 'vault.claimed':
      return pick(c.claimedAmount, c.claimed, { amount: trimUsdc(str('principalUsdc')) });
    case 'vault.cooldown.completed':
      return pick(c.cooldownDoneAmount, c.cooldownDone, { amount: trimUsdc(str('principalUsdc')) });
    case 'cashout.arc.completed':
      return fill(c.cashedOut, { amount: trimUsdc(str('amountUsdc') || '0') });
    case 'factoring.requested':
      return c.factoringRequested;
    case 'factoring.offered': {
      const advance = trimUsdc(str('advance'));
      const bps = payload?.discountBps;
      if (!advance) return c.factoringOfferedPlain;
      return typeof bps === 'number'
        ? fill(c.factoringOfferedAt, { amount: advance, pct: (bps / 100).toFixed(1).replace(/\.0$/, '') })
        : fill(c.factoringOffered, { amount: advance });
    }
    case 'factoring.accepted':
      return c.factoringAccepted;
    case 'factoring.settled':
      return seller ? c.factoringSettledSeller : c.factoringSettledFinancier;
    case 'factoring.defaulted':
      return seller ? c.factoringDefaultedSeller : c.factoringDefaulted;
    case 'po.funded':
      return c.poFunded;
    case 'po.released':
      return seller ? c.poReleasedSeller : c.poReleasedBuyer;
    case 'po.repaid':
      return seller ? c.poRepaidSeller : c.poRepaidFinancier;
    case 'po.defaulted':
      return seller ? c.poDefaultedSeller : c.poDefaulted;
    case 'agent.funded':
    case 'agent.withdrawal': {
      const which = str('agent');
      const name = which === 'buyer' ? c.agents.buyer : which === 'seller' ? c.agents.seller : c.agents.agent;
      const values = { amount: trimUsdc(str('amountUsdc') || '0'), which: name };
      if (type === 'agent.withdrawal') return fill(c.agentWithdrawal, values);
      return fill(payload?.seed === true ? c.agentSeeded : c.agentFunded, values);
    }
    case 'reputation.tier-up': {
      const to = str('toTier');
      const from = str('fromTier');
      if (to && from) return fill(c.tierUpFrom, { to, from });
      return to ? fill(c.tierUp, { to }) : c.tierUpPlain;
    }
    default:
      return c.fallback;
  }
}
