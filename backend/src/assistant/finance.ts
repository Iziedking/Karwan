/// Getting paid early from the assistant (view 31, phase B; view 18): the
/// seller asks for early payment on a delivered order, takes or turns down a
/// financier's offer, or stops asking; a financier makes an offer or applies
/// for the desk. Pure, so every refusal and every card is tested without the
/// chain; financeTools.ts reads the state and passes it in.

import { confirmNonce, type ConfirmActionBase } from './actions.js';

/// The deal fields the seller's cards read (DirectDeal).
export interface FinanceDeal {
  jobId: string;
  seller: string;
  dealAmountUsdc: string;
  tradeLane?: 'service' | 'finance' | null;
  escrowVersion?: string;
  factoringRequestedAt?: number;
  factoringOfferId?: string | null;
  poFinancingRequestedAt?: number | null;
  poFinancingId?: string | null;
}

/// One offer as the seller's ranked list returns it (GET /api/factoring/offers/:invoiceId).
export interface FinanceOffer {
  id: string;
  invoiceId: string;
  seller: string;
  offeredAdvanceUsdc: string;
  expectedReturnUsdc: string;
  status: string;
  expiresAt: number;
  recommended?: boolean;
  /// False when the financier's wallet does not hold the advance yet.
  funded?: boolean;
  /// On the escrow family: what the offer holds of the seller's deal guarantee,
  /// what they would put up first, and whether the financier still has to pay.
  holdUsdc?: string;
  gapUsdc?: string;
  waitingForFinancier?: boolean;
}

/// A line the seller took that an own-wallet financier still has to pay.
export interface FinancierLine {
  id: string;
  invoiceId: string;
  financier: string;
  offeredAdvanceUsdc: string;
  status: string;
  sellerDeadline?: number;
}

/// One request on the financier's desk (GET /api/factoring/available).
export interface FundableRequest {
  jobId: string;
  dealAmountUsdc: string;
  claimableUsdc: string;
  factoringRequestedAdvanceUsdc?: string;
  factoringMinAdvanceUsdc?: string;
  factoringAdvanceRecipient: string;
}

export type FinanceSigner = 'karwan' | 'wallet';

export interface FinanceAskConfirm extends ConfirmActionBase {
  intent: 'finance_ask';
  payload: { invoiceId: string; requestedAdvanceUsdc: string; minAdvanceUsdc?: string };
}
export interface FinanceStopAskingConfirm extends ConfirmActionBase {
  intent: 'finance_stop_asking';
  payload: { invoiceId: string };
}
export interface FinanceAcceptConfirm extends ConfirmActionBase {
  intent: 'finance_accept';
  /// putUpGap: Karwan deposits the short guarantee from the wallet it holds.
  /// walletDepositUsdc: the person's own wallet deposits it first, on the website.
  payload: { offerId: string; jobId: string; putUpGap?: boolean; walletDepositUsdc?: string };
}
export interface FinancePaySellerConfirm extends ConfirmActionBase {
  intent: 'finance_pay_seller';
  payload: { offerId: string; jobId: string };
}
export interface FinanceRejectConfirm extends ConfirmActionBase {
  intent: 'finance_reject';
  payload: { offerId: string; jobId: string };
}
export interface FinanceOfferConfirm extends ConfirmActionBase {
  intent: 'finance_offer';
  payload: {
    invoiceId: string;
    offeredAdvanceUsdc: string;
    expectedReturnUsdc: string;
    expiresInHours: number;
    signer: FinanceSigner;
    /// Where the advance is paid: a wallet financier signs it to this address.
    advanceRecipient: string;
  };
}
export interface FinanceApplyConfirm extends ConfirmActionBase {
  intent: 'finance_apply';
  payload: Record<string, never>;
}

/// How long a financier's offer stays open, as on the financier desk.
export const OFFER_HOURS = 24;

const NOT_ON_THIS_DEAL = 'Getting paid early is not open on deals made on the new escrow yet, which this one is. Deals made before it can use it now.';
const MOVED = 'Getting paid early now runs on new deals only. This deal finishes as it is.';

const SCALE = 1_000_000n;
function micros(value: string): bigint {
  const v = value.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(v)) throw new Error('Invalid USDC amount');
  const [whole, frac = ''] = v.split('.');
  return BigInt(whole!) * SCALE + BigInt(frac.padEnd(6, '0'));
}
function usdc(m: bigint): string {
  const whole = m / SCALE;
  const frac = (m % SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}
const show = (value: string) => `${Number(value).toFixed(2)} USDC`;

/// The financier's quote, the same exact arithmetic as the financier desk
/// (frontend/features/factoring/factoringQuote.ts): the seller's assigned
/// share of the settlement, capped by what the escrow can still pay, less the
/// discount; the financier receives the whole assigned share at release.
export function financeQuote(i: { claimableUsdc: string; requestedAdvanceUsdc?: string; discountBps: number }): { advanceUsdc: string; returnUsdc: string } {
  if (!Number.isInteger(i.discountBps) || i.discountBps < 0 || i.discountBps > 10_000) throw new Error('Invalid discount');
  const available = micros(i.claimableUsdc);
  const requested = i.requestedAdvanceUsdc ? micros(i.requestedAdvanceUsdc) : available;
  const assigned = requested < available ? requested : available;
  const advance = (assigned * BigInt(10_000 - i.discountBps)) / 10_000n;
  return { advanceUsdc: usdc(advance), returnUsdc: usdc(assigned) };
}

/// Why this seller cannot ask on this deal, in their words, or null.
function askRefusal(deal: FinanceDeal, me: string, factorable: boolean): string | null {
  if (deal.seller.toLowerCase() !== me.toLowerCase()) return 'Only the seller on a deal can ask to be paid early.';
  if (deal.escrowVersion === 'v3') return NOT_ON_THIS_DEAL;
  if (deal.escrowVersion !== 'suite') return MOVED;
  if (deal.tradeLane !== 'finance') return 'Getting paid early is for business orders (goods or mixed) between two verified businesses, not this deal.';
  if (deal.factoringOfferId) return 'This deal has already been paid early.';
  if (deal.poFinancingRequestedAt || deal.poFinancingId) return 'This deal already has purchase-order financing.';
  if (deal.factoringRequestedAt) return 'They have already asked to be paid early on this deal. Financiers can make offers now.';
  if (!factorable) return 'They can ask to be paid early once the order is accepted and fully paid in, before the buyer releases payment.';
  return null;
}

export function buildAskConfirm(i: {
  deal: FinanceDeal;
  me: string;
  factorable: boolean;
  /// What the escrow can still pay the seller; null when it could not be read.
  claimableUsdc: string | null;
  amountUsdc?: number;
  leastUsdc?: number;
}): FinanceAskConfirm | { error: string } {
  const refused = askRefusal(i.deal, i.me, i.factorable);
  if (refused) return { error: refused };
  if (i.claimableUsdc === null) return { error: 'Could not read the escrow for this deal just now. Try again shortly.' };
  const claimable = Number(i.claimableUsdc);
  if (!(claimable > 0)) return { error: 'Nothing on this deal is still to be paid, so there is nothing to be paid early.' };
  const amount = i.amountUsdc ?? claimable;
  if (!(amount > 0) || amount > claimable + 1e-6) return { error: `They can ask for up to ${show(i.claimableUsdc)}, what this deal still has to pay them.` };
  if (i.leastUsdc !== undefined && !(i.leastUsdc > 0 && i.leastUsdc < amount)) return { error: 'The least they would take must be above 0 and below the amount they ask for.' };
  const asked = amount.toFixed(6).replace(/\.?0+$/, '');
  const least = i.leastUsdc !== undefined ? i.leastUsdc.toFixed(6).replace(/\.?0+$/, '') : undefined;
  return {
    kind: 'confirm',
    id: `finance_ask:${i.deal.jobId}:${confirmNonce()}`,
    intent: 'finance_ask',
    title: 'Ask to be paid early',
    summary: 'Financiers see this request and can make offers. Nothing moves until you take one.',
    fields: [
      { label: 'Still to be paid', value: show(i.claimableUsdc) },
      { label: 'You ask for', value: show(asked) },
      ...(least ? [{ label: 'Least you would take', value: show(least) }] : []),
    ],
    payload: { invoiceId: i.deal.jobId, requestedAdvanceUsdc: asked, ...(least ? { minAdvanceUsdc: least } : {}) },
    confirmLabel: 'Ask financiers',
    cancelLabel: 'Not now',
  };
}

export function buildStopAskingConfirm(i: { deal: FinanceDeal; me: string }): FinanceStopAskingConfirm | { error: string } {
  if (i.deal.seller.toLowerCase() !== i.me.toLowerCase()) return { error: 'Only the seller on a deal can stop asking to be paid early.' };
  if (!i.deal.factoringRequestedAt || i.deal.factoringOfferId) return { error: 'They are not asking to be paid early on this deal.' };
  return {
    kind: 'confirm',
    id: `finance_stop_asking:${i.deal.jobId}:${confirmNonce()}`,
    intent: 'finance_stop_asking',
    title: 'Stop asking to be paid early',
    summary: 'Financiers no longer see this deal. Offers already made stay until you answer them.',
    fields: [{ label: 'Deal total', value: show(i.deal.dealAmountUsdc) }],
    payload: { invoiceId: i.deal.jobId },
    confirmLabel: 'Stop asking',
    cancelLabel: 'Not now',
  };
}

/// An offer the seller can still answer, or why not.
function offerRefusal(offer: FinanceOffer, me: string, nowMs: number): string | null {
  if (offer.seller.toLowerCase() !== me.toLowerCase()) return 'Only the seller this offer was made to can answer it.';
  if (offer.status !== 'offered') return 'This offer has already been answered.';
  if (nowMs >= offer.expiresAt) return 'This offer has expired. Ask the financiers for a new one.';
  return null;
}

export function buildAcceptOfferConfirm(i: { offer: FinanceOffer; me: string; nowMs: number; signer?: FinanceSigner }): FinanceAcceptConfirm | { error: string } {
  if (i.offer.waitingForFinancier) return { error: 'You took this offer. Waiting for the financier to pay, within 24 hours of when you took it.' };
  const refused = offerRefusal(i.offer, i.me, i.nowMs);
  if (refused) return { error: refused };
  if (i.offer.funded === false) return { error: 'The financier has not added the money for this offer yet, so it cannot be taken. They have been told; choose another offer or wait.' };
  const gap = i.offer.gapUsdc && Number(i.offer.gapUsdc) > 0 ? i.offer.gapUsdc : undefined;
  const label = gap ? `Deposit ${show(gap)} and get paid now` : 'Get paid now';
  const fromWallet = !!gap && i.signer === 'wallet';
  return {
    kind: 'confirm',
    id: `finance_accept:${i.offer.id}:${confirmNonce()}`,
    intent: 'finance_accept',
    title: gap ? label : `Get paid ${show(i.offer.offeredAdvanceUsdc)} now`,
    summary: `${fromWallet ? `Your wallet signs the ${show(gap!)} deposit to your deal guarantee first. ` : ''}When the buyer releases payment, the escrow repays the financier ${show(i.offer.expectedReturnUsdc)} first and pays you the rest.`,
    warning: 'Once you are paid this cannot be undone, and the financier is repaid from this deal before you.',
    fields: [
      { label: 'Paid to you now', value: show(i.offer.offeredAdvanceUsdc) },
      { label: 'Repaid to the financier', value: show(i.offer.expectedReturnUsdc) },
      ...(i.offer.holdUsdc ? [{ label: 'Held from your deal guarantee until it is repaid', value: show(i.offer.holdUsdc) }] : []),
      ...(gap ? [{ label: 'Deposited first to your deal guarantee', value: show(gap) }] : []),
      ...(i.offer.recommended ? [{ label: 'Offer', value: 'Recommended' }] : []),
    ],
    payload: { offerId: i.offer.id, jobId: i.offer.invoiceId, ...(fromWallet ? { walletDepositUsdc: gap } : gap ? { putUpGap: true } : {}) },
    confirmLabel: label,
    cancelLabel: 'Not now',
  };
}

/// An own-wallet financier pays the seller from their wallet within 24 hours
/// of the seller taking the offer.
export function buildPaySellerConfirm(i: { line: FinancierLine; me: string; nowMs: number }): FinancePaySellerConfirm | { error: string } {
  if (i.line.financier.toLowerCase() !== i.me.toLowerCase()) return { error: 'Only the financier who made this offer can pay it.' };
  if (i.line.status !== 'awaiting_financier') return { error: 'This offer is not waiting for a payment.' };
  if (!i.line.sellerDeadline || i.nowMs > i.line.sellerDeadline) return { error: 'The 24 hours to pay the seller have passed. Nothing was held and nothing moved.' };
  const hours = Math.max(1, Math.floor((i.line.sellerDeadline - i.nowMs) / 3_600_000));
  return {
    kind: 'confirm',
    id: `finance_pay_seller:${i.line.id}:${confirmNonce()}`,
    intent: 'finance_pay_seller',
    title: `Pay the seller ${show(i.line.offeredAdvanceUsdc)}`,
    summary: 'Your wallet pays the seller now, and the escrow repays you first when the buyer releases payment.',
    warning: 'Once the seller is paid this cannot be undone.',
    fields: [
      { label: 'You pay now', value: show(i.line.offeredAdvanceUsdc) },
      { label: 'Time left', value: `${hours} hours` },
    ],
    payload: { offerId: i.line.id, jobId: i.line.invoiceId },
    confirmLabel: 'Pay the seller',
    cancelLabel: 'Not now',
  };
}

export function buildRejectOfferConfirm(i: { offer: FinanceOffer; me: string; nowMs: number }): FinanceRejectConfirm | { error: string } {
  const refused = offerRefusal(i.offer, i.me, i.nowMs);
  if (refused) return { error: refused };
  return {
    kind: 'confirm',
    id: `finance_reject:${i.offer.id}:${confirmNonce()}`,
    intent: 'finance_reject',
    title: 'Turn down this offer',
    summary: `The financier is told you will not take ${show(i.offer.offeredAdvanceUsdc)} now. Other offers stay open.`,
    fields: [{ label: 'Offer', value: `${show(i.offer.offeredAdvanceUsdc)} now` }],
    payload: { offerId: i.offer.id, jobId: i.offer.invoiceId },
    confirmLabel: 'Turn down',
    cancelLabel: 'Not now',
  };
}

export function buildFinancierOfferConfirm(i: {
  request: FundableRequest;
  discountPercent: number;
  /// The financier's wallet, in USDC; null when it could not be read.
  walletUsdc: string | null;
  signer: FinanceSigner;
}): FinanceOfferConfirm | { error: string } {
  if (!(i.discountPercent >= 0.1 && i.discountPercent <= 50)) return { error: 'The discount must be between 0.1% and 50%.' };
  const { advanceUsdc, returnUsdc } = financeQuote({
    claimableUsdc: i.request.claimableUsdc,
    requestedAdvanceUsdc: i.request.factoringRequestedAdvanceUsdc,
    discountBps: Math.round(i.discountPercent * 100),
  });
  if (!(Number(advanceUsdc) > 0)) return { error: 'There is nothing left on this deal to finance.' };
  const floor = i.request.factoringMinAdvanceUsdc;
  if (floor && Number(advanceUsdc) < Number(floor)) {
    return { error: `The seller takes no less than ${show(floor)} now; this discount pays ${show(advanceUsdc)}. Lower the discount.` };
  }
  if (i.walletUsdc === null) return { error: 'Could not read their wallet just now. Try again shortly.' };
  if (Number(i.walletUsdc) + 1e-6 < Number(advanceUsdc)) {
    const short = (Number(advanceUsdc) - Number(i.walletUsdc)).toFixed(2);
    return { error: `Their wallet holds ${show(i.walletUsdc)}. Add ${short} USDC first, so the seller can take the offer the moment they choose it.` };
  }
  return {
    kind: 'confirm',
    id: `finance_offer:${i.request.jobId}:${confirmNonce()}`,
    intent: 'finance_offer',
    title: `Offer to pay ${show(advanceUsdc)} now`,
    summary: `If the seller takes it, ${show(advanceUsdc)} leaves your wallet to them, and the escrow repays you ${show(returnUsdc)} when the buyer releases payment.`,
    warning: `Keep ${show(advanceUsdc)} in your wallet while the offer is open (${OFFER_HOURS} hours). Repayment depends on the deal settling; if it goes to dispute or is refunded, you may get back less.`,
    fields: [
      { label: 'You pay now', value: show(advanceUsdc) },
      { label: 'You are repaid', value: show(returnUsdc) },
      { label: 'Discount', value: `${i.discountPercent}%` },
      { label: 'Open for', value: `${OFFER_HOURS} hours` },
    ],
    payload: {
      invoiceId: i.request.jobId,
      offeredAdvanceUsdc: advanceUsdc,
      expectedReturnUsdc: returnUsdc,
      expiresInHours: OFFER_HOURS,
      signer: i.signer,
      advanceRecipient: i.request.factoringAdvanceRecipient,
    },
    confirmLabel: 'Make the offer',
    cancelLabel: 'Not now',
  };
}

export function buildApplyConfirm(i: { status: string; eligible: boolean; reasons: string[] }): FinanceApplyConfirm | { error: string } {
  if (i.status === 'approved') return { error: 'They are already a financier. Ask for the requests they can fund.' };
  if (i.status === 'applied') return { error: 'Their application is with the team already.' };
  if (!i.eligible) return { error: `Not eligible yet: ${i.reasons.join('; ') || 'the financier bar is not met'}.` };
  return {
    kind: 'confirm',
    id: `finance_apply:${confirmNonce()}`,
    intent: 'finance_apply',
    title: 'Apply to finance deals',
    summary: 'Financiers pay sellers early on delivered business orders and are repaid from the escrow when the buyer releases payment.',
    fields: [{ label: 'You', value: 'Meet the financier bar' }],
    payload: {},
    confirmLabel: 'Apply',
    cancelLabel: 'Not now',
  };
}
