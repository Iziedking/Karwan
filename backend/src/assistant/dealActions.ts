import { confirmNonce, type ConfirmActionBase } from './actions.js';
import { parseStatement } from '../deals/disputeJudge.js';
import { approvedDeadline } from '../deals/deliveryDeadline.js';
import { checkOffer, type OfferRuleError } from '../offers/rules.js';

/// Confirm cards for the steps of a request or deal after it is posted:
/// choosing an offer, editing, raising the price, extensions, cancelling,
/// disputes and turning a deal down. Each payload is the exact body the
/// panel sends to an existing route, so the route stays the only authority.

const MAX_EXTENSION_DAYS = 30;
const DAY_SECONDS = 86_400;

const isoDay = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
const shortId = (jobId: string) => jobId.slice(0, 10);

export interface ChooseOfferConfirm extends ConfirmActionBase {
  intent: 'choose_offer';
  payload: { jobId: string; caller: string; seller: string; amountUsdc?: number; acknowledgeUnverified?: boolean };
}
export interface EditRequestConfirm extends ConfirmActionBase {
  intent: 'edit_request';
  payload: { jobId: string; caller: string; briefText?: string; negotiationMaxIncreasePct?: number };
}
export interface RaiseOfferConfirm extends ConfirmActionBase {
  intent: 'raise_offer';
  payload: { jobId: string; caller: string; priceUsdc: string };
}
export interface RequestExtensionConfirm extends ConfirmActionBase {
  intent: 'request_extension';
  payload: { jobId: string; caller: string; additionalSeconds: number; reason?: string };
}
export interface RespondExtensionConfirm extends ConfirmActionBase {
  intent: 'respond_extension';
  payload: { jobId: string; caller: string; decision: 'approved' | 'declined' };
}
export interface CancelDealConfirm extends ConfirmActionBase {
  intent: 'cancel_deal';
  payload: { jobId: string; caller: string; step: 'propose' | 'accept' | 'decline'; reason?: string };
}
export interface DisputeStatementConfirm extends ConfirmActionBase {
  intent: 'dispute_statement';
  payload: { jobId: string; caller: string; received: string; missing: string; late: string; links: string[] };
}
export interface EscalateDisputeConfirm extends ConfirmActionBase {
  intent: 'escalate_dispute';
  payload: { jobId: string; caller: string };
}
/// Either side raises a problem with a delivery: the deal goes to dispute and
/// each side has 72 hours to give their side; a side that stays silent loses.
export interface RaiseProblemConfirm extends ConfirmActionBase {
  intent: 'raise_problem';
  payload: { jobId: string; caller: string; reason: string };
}
export interface DeclineDealConfirm extends ConfirmActionBase {
  intent: 'decline_deal';
  payload: { jobId: string; caller: string; note: string };
}

/// Phase C of view 31: the rest of the steps the deal page has.
export interface GoodsArrivedConfirm extends ConfirmActionBase {
  intent: 'goods_arrived';
  payload: { jobId: string; caller: string };
}
export interface ReviewDeliveryMyselfConfirm extends ConfirmActionBase {
  intent: 'review_delivery_myself';
  payload: { jobId: string; caller: string };
}
export interface ClaimPaymentConfirm extends ConfirmActionBase {
  intent: 'claim_payment';
  payload: { jobId: string; caller: string };
}
export interface StillReviewingConfirm extends ConfirmActionBase {
  intent: 'still_reviewing';
  payload: { jobId: string; caller: string };
}
export interface DelayAppealConfirm extends ConfirmActionBase {
  intent: 'delay_appeal';
  payload: { jobId: string; caller: string };
}
export interface AnswerDelayAppealConfirm extends ConfirmActionBase {
  intent: 'answer_delay_appeal';
  payload: { jobId: string; caller: string; reason: string };
}
export interface TakeBackDealConfirm extends ConfirmActionBase {
  intent: 'take_back_deal';
  payload: { jobId: string; caller: string };
}
/// The buyer edits their own deal; the seller counters it. Same body, two routes.
export interface ChangeDealTermsConfirm extends ConfirmActionBase {
  intent: 'change_deal_terms';
  payload: { jobId: string; caller: string; as: 'buyer' | 'seller'; dealAmountUsdc?: number; terms?: string; deadlineDays?: number };
}

/// A seller's own offer on someone's request, and the buyer taking one.
export interface MakeOfferConfirm extends ConfirmActionBase {
  intent: 'make_offer';
  payload: { jobId: string; priceUsdc: string; deliverByUnix: number; note: string };
}
export interface WithdrawOfferConfirm extends ConfirmActionBase {
  intent: 'withdraw_offer';
  payload: { jobId: string; offerId: string };
}
export interface AcceptSellerOfferConfirm extends ConfirmActionBase {
  intent: 'accept_offer';
  payload: { jobId: string; offerId: string };
}
/// A near match: the agents got close but not within the limits, and one side
/// is asked whether to go ahead at the price they reached.
export interface NearMissProceedConfirm extends ConfirmActionBase {
  intent: 'near_miss_proceed';
  payload: { jobId: string; caller: string };
}
export interface NearMissPassConfirm extends ConfirmActionBase {
  intent: 'near_miss_pass';
  payload: { jobId: string; caller: string };
}
export interface ReconsiderOfferConfirm extends ConfirmActionBase {
  intent: 'reconsider_offer';
  payload: { jobId: string; caller: string };
}

export interface EditListingConfirm extends ConfirmActionBase {
  intent: 'edit_listing';
  payload: { listingId: string; caller: string; title?: string; description?: string; askingPriceUsdc?: number };
}
export interface StopAgentBidConfirm extends ConfirmActionBase {
  intent: 'stop_agent_bid';
  payload: { jobId: string };
}
/// The buyer of a goods deal records that the goods reached them on the trade
/// record. Karwan signs it for an account whose wallet it holds.
export interface ConfirmGoodsReceivedConfirm extends ConfirmActionBase {
  intent: 'confirm_goods_received';
  payload: { address: string; invoiceId: string; podHash: string };
}

export type DealStepConfirm =
  | EditListingConfirm
  | StopAgentBidConfirm
  | ConfirmGoodsReceivedConfirm
  | MakeOfferConfirm
  | WithdrawOfferConfirm
  | AcceptSellerOfferConfirm
  | NearMissProceedConfirm
  | NearMissPassConfirm
  | ReconsiderOfferConfirm
  | GoodsArrivedConfirm
  | ReviewDeliveryMyselfConfirm
  | ClaimPaymentConfirm
  | StillReviewingConfirm
  | DelayAppealConfirm
  | AnswerDelayAppealConfirm
  | TakeBackDealConfirm
  | ChangeDealTermsConfirm
  | ChooseOfferConfirm
  | EditRequestConfirm
  | RaiseOfferConfirm
  | RequestExtensionConfirm
  | RespondExtensionConfirm
  | CancelDealConfirm
  | DisputeStatementConfirm
  | EscalateDisputeConfirm
  | RaiseProblemConfirm
  | DeclineDealConfirm;

export function buildChooseOfferConfirm(i: {
  caller: string;
  jobId: string;
  seller: string;
  sellerLabel: string;
  priceUsdc: string;
  /// The seller is not verified: the card says so first, and confirming
  /// carries the person's acknowledgement to the route.
  unverified?: boolean;
}): ChooseOfferConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the request id.' };
  if (!i.seller) return { error: 'Missing which offer to choose.' };
  return {
    kind: 'confirm',
    id: `choose_offer:${i.jobId}:${i.seller.toLowerCase()}:${confirmNonce()}`,
    intent: 'choose_offer',
    title: 'Choose this offer',
    summary: `Go with ${i.sellerLabel} at ${i.priceUsdc} USDC and start the deal.`,
    warning: [
      i.unverified
        ? `${i.sellerLabel} is not verified. Karwan has not checked their identity or past work. Your money stays in escrow until you release it.`
        : null,
      'This funds the escrow from your buyer agent. The money stays protected until the work is delivered or the deal is cancelled.',
    ]
      .filter(Boolean)
      .join(' '),
    fields: [
      { label: 'Seller', value: i.sellerLabel },
      { label: 'Price', value: `${i.priceUsdc} USDC` },
      { label: 'Request', value: shortId(i.jobId) },
    ],
    payload: {
      jobId: i.jobId,
      caller: i.caller,
      seller: i.seller,
      amountUsdc: Number(i.priceUsdc),
      ...(i.unverified ? { acknowledgeUnverified: true } : {}),
    },
    confirmLabel: `Choose and fund ${i.priceUsdc} USDC`,
    cancelLabel: 'Not now',
  };
}

export function buildEditRequestConfirm(i: {
  caller: string;
  jobId: string;
  briefText?: string;
  negotiationMaxIncreasePct?: number;
}): EditRequestConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the request id.' };
  const briefText = i.briefText?.trim();
  if (!briefText && i.negotiationMaxIncreasePct === undefined) {
    return { error: 'Say what to change: the description or how far above budget the agent may go.' };
  }
  const fields = [{ label: 'Request', value: shortId(i.jobId) }];
  if (briefText) fields.push({ label: 'New description', value: briefText });
  if (i.negotiationMaxIncreasePct !== undefined) {
    fields.push({ label: 'Agent may go above budget by', value: `${i.negotiationMaxIncreasePct}%` });
  }
  return {
    kind: 'confirm',
    id: `edit_request:${i.jobId}:${confirmNonce()}`,
    intent: 'edit_request',
    title: 'Update this request',
    summary: 'Your agent uses the new details from now on. Budget and due date stay as posted.',
    fields,
    payload: {
      jobId: i.jobId,
      caller: i.caller,
      ...(briefText ? { briefText } : {}),
      ...(i.negotiationMaxIncreasePct !== undefined ? { negotiationMaxIncreasePct: i.negotiationMaxIncreasePct } : {}),
    },
    confirmLabel: 'Save changes',
    cancelLabel: 'Keep as is',
  };
}

export function buildRaiseOfferConfirm(i: {
  caller: string;
  jobId: string;
  currentPriceUsdc: string;
  priceUsdc: number;
}): RaiseOfferConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the request id.' };
  if (!(i.priceUsdc > Number(i.currentPriceUsdc))) {
    return { error: `The new price must be above the agreed ${i.currentPriceUsdc} USDC.` };
  }
  const price = String(i.priceUsdc);
  return {
    kind: 'confirm',
    id: `raise_offer:${i.jobId}:${price}:${confirmNonce()}`,
    intent: 'raise_offer',
    title: 'Ask for a higher price',
    summary: `The buyer decides whether to go ahead at ${price} USDC or decline.`,
    fields: [
      { label: 'Agreed price', value: `${i.currentPriceUsdc} USDC` },
      { label: 'Your price', value: `${price} USDC` },
    ],
    payload: { jobId: i.jobId, caller: i.caller, priceUsdc: price },
    confirmLabel: `Ask for ${price} USDC`,
    cancelLabel: 'Keep the agreed price',
  };
}

export function buildRequestExtensionConfirm(i: {
  caller: string;
  jobId: string;
  days: number;
  currentDeadlineUnix: number;
  /// Now, so a request after the date shows the date an approval now would give.
  nowUnix?: number;
  reason?: string;
}): RequestExtensionConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  if (!Number.isInteger(i.days) || i.days < 1 || i.days > MAX_EXTENSION_DAYS) {
    return { error: `Ask for between 1 and ${MAX_EXTENSION_DAYS} whole days.` };
  }
  const additionalSeconds = i.days * DAY_SECONDS;
  const reason = i.reason?.trim();
  const passed = i.nowUnix !== undefined && i.nowUnix > i.currentDeadlineUnix;
  return {
    kind: 'confirm',
    id: `request_extension:${i.jobId}:${i.days}:${confirmNonce()}`,
    intent: 'request_extension',
    title: 'Ask for more time',
    summary: passed
      ? 'The buyer approves or declines. The money stays in the deal until they answer.'
      : 'The buyer approves or declines. Until then the current deadline stands.',
    fields: [
      { label: 'Extra time', value: `${i.days} day${i.days === 1 ? '' : 's'}` },
      { label: 'Current deadline', value: isoDay(i.currentDeadlineUnix) },
      { label: 'New deadline', value: isoDay(approvedDeadline(i.currentDeadlineUnix, i.nowUnix ?? i.currentDeadlineUnix, additionalSeconds)) },
      ...(reason ? [{ label: 'Reason', value: reason }] : []),
    ],
    payload: { jobId: i.jobId, caller: i.caller, additionalSeconds, ...(reason ? { reason } : {}) },
    confirmLabel: 'Send request',
    cancelLabel: 'Not now',
  };
}

export function buildRespondExtensionConfirm(i: {
  caller: string;
  jobId: string;
  decision: 'approve' | 'decline';
  days: number;
  newDeadlineUnix?: number;
  /// The delivery date has passed: a decline lets the refund go ahead.
  deadlinePassed?: boolean;
}): RespondExtensionConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  const approve = i.decision === 'approve';
  return {
    kind: 'confirm',
    id: `respond_extension:${i.jobId}:${i.decision}:${confirmNonce()}`,
    intent: 'respond_extension',
    title: approve ? 'Give more time' : 'Keep the deadline',
    summary: approve
      ? `The seller gets ${i.days} more day${i.days === 1 ? '' : 's'} to deliver.`
      : i.deadlinePassed
        ? 'The delivery date has passed. Your money comes back to you unless the seller delivers in the time left.'
        : 'The seller delivers by the current deadline.',
    fields: [
      { label: 'Extra time asked', value: `${i.days} day${i.days === 1 ? '' : 's'}` },
      ...(approve && i.newDeadlineUnix ? [{ label: 'New deadline', value: isoDay(i.newDeadlineUnix) }] : []),
    ],
    payload: { jobId: i.jobId, caller: i.caller, decision: approve ? 'approved' : 'declined' },
    confirmLabel: approve ? 'Approve' : 'Decline',
    cancelLabel: 'Decide later',
  };
}

export function buildCancelDealConfirm(i: {
  caller: string;
  jobId: string;
  step: 'propose' | 'accept' | 'decline';
  amountUsdc: string;
  reason?: string;
}): CancelDealConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  const amount = { label: 'Deal', value: `${i.amountUsdc} USDC` };
  if (i.step === 'propose') {
    const reason = i.reason?.trim();
    if (!reason) return { error: 'Ask them for a short reason; the other side sees it.' };
    return {
      kind: 'confirm',
      id: `cancel_deal:${i.jobId}:propose:${confirmNonce()}`,
      intent: 'cancel_deal',
      title: 'Propose cancelling',
      summary: 'The other side accepts or declines. Nothing changes until they accept.',
      fields: [amount, { label: 'Reason', value: reason }],
      payload: { jobId: i.jobId, caller: i.caller, step: 'propose', reason },
      confirmLabel: 'Send proposal',
      cancelLabel: 'Keep the deal',
    };
  }
  if (i.step === 'accept') {
    return {
      kind: 'confirm',
      id: `cancel_deal:${i.jobId}:accept:${confirmNonce()}`,
      intent: 'cancel_deal',
      title: 'Agree to cancel',
      summary: 'The deal ends and the escrow is returned as the cancellation sets out.',
      warning: 'This ends the deal and cannot be undone.',
      fields: [amount],
      payload: { jobId: i.jobId, caller: i.caller, step: 'accept' },
      confirmLabel: 'Cancel the deal',
      cancelLabel: 'Not now',
    };
  }
  return {
    kind: 'confirm',
    id: `cancel_deal:${i.jobId}:decline:${confirmNonce()}`,
    intent: 'cancel_deal',
    title: 'Keep the deal going',
    summary: 'Turn down the cancellation. The deal continues as agreed.',
    fields: [amount],
    payload: { jobId: i.jobId, caller: i.caller, step: 'decline' },
    confirmLabel: 'Decline cancellation',
    cancelLabel: 'Decide later',
  };
}

export function buildDisputeStatementConfirm(i: {
  caller: string;
  jobId: string;
  received: string;
  missing: string;
  late: string;
  links: string[];
}): DisputeStatementConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  const parsed = parseStatement({ received: i.received, missing: i.missing, late: i.late, links: i.links });
  if (!parsed.ok) {
    return { error: 'Ask them for all three answers: what was received, what is missing, and how late it was. Links must start with http, five at most.' };
  }
  const v = parsed.value;
  return {
    kind: 'confirm',
    id: `dispute_statement:${i.jobId}:${confirmNonce()}`,
    intent: 'dispute_statement',
    title: 'Give your statement',
    summary: 'The other side sees it only after they give theirs or the window closes.',
    fields: [
      { label: 'Received', value: v.received },
      { label: 'Missing', value: v.missing },
      { label: 'How late', value: v.late },
      ...(v.links.length ? [{ label: 'Links', value: v.links.join(', ') }] : []),
    ],
    payload: { jobId: i.jobId, caller: i.caller, received: v.received, missing: v.missing, late: v.late, links: v.links },
    confirmLabel: 'Submit statement',
    cancelLabel: 'Edit first',
  };
}

export function buildEscalateDisputeConfirm(i: {
  caller: string;
  jobId: string;
  amountUsdc: string;
}): EscalateDisputeConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  return {
    kind: 'confirm',
    id: `escalate_dispute:${i.jobId}:${confirmNonce()}`,
    intent: 'escalate_dispute',
    title: 'Send to review',
    summary: 'A Karwan reviewer looks at the deal, both statements and the evidence, then rules.',
    fields: [
      { label: 'Deal', value: shortId(i.jobId) },
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
    ],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Send to review',
    cancelLabel: 'Not now',
  };
}

export function buildRaiseProblemConfirm(i: {
  caller: string;
  jobId: string;
  amountUsdc: string;
  reason: string;
}): RaiseProblemConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  const reason = i.reason.trim();
  if (!reason) return { error: 'Ask them what is wrong, in a sentence.' };
  return {
    kind: 'confirm',
    id: `raise_problem:${i.jobId}:${confirmNonce()}`,
    intent: 'raise_problem',
    title: 'Raise a problem',
    summary: 'The payment stays held while this is looked at. You and the other side each have 72 hours to give your side; a side that stays silent loses.',
    fields: [
      { label: 'Deal', value: shortId(i.jobId) },
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
      { label: 'What is wrong', value: reason },
    ],
    payload: { jobId: i.jobId, caller: i.caller, reason },
    confirmLabel: 'Raise the problem',
    cancelLabel: 'Not now',
  };
}

export function buildDeclineDealConfirm(i: {
  caller: string;
  jobId: string;
  amountUsdc: string;
  counterpartyLabel: string;
  note: string;
}): DeclineDealConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  const note = i.note.trim();
  if (!note) return { error: 'Ask them for a short note to the buyer.' };
  return {
    kind: 'confirm',
    id: `decline_deal:${i.jobId}:${confirmNonce()}`,
    intent: 'decline_deal',
    title: 'Turn down this deal',
    summary: `Tell ${i.counterpartyLabel} you will not take this ${i.amountUsdc} USDC deal. No money has moved.`,
    fields: [
      { label: 'Buyer', value: i.counterpartyLabel },
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
      { label: 'Note', value: note },
    ],
    payload: { jobId: i.jobId, caller: i.caller, note },
    confirmLabel: 'Turn down',
    cancelLabel: 'Keep it open',
  };
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
export function durationText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 120) return plural(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  return hours % 24 === 0 ? plural(hours / 24, 'day') : plural(hours, 'hour');
}
const dealField = (amountUsdc: string) => ({ label: 'Deal', value: `${amountUsdc} USDC` });

export function buildGoodsArrivedConfirm(i: { caller: string; jobId: string; amountUsdc: string; carrier?: string }): GoodsArrivedConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  return {
    kind: 'confirm',
    id: `goods_arrived:${i.jobId}:${confirmNonce()}`,
    intent: 'goods_arrived',
    title: 'The goods arrived',
    summary: 'Your review time starts now. This does not pay the seller; you still release or raise a problem.',
    fields: [dealField(i.amountUsdc), ...(i.carrier ? [{ label: 'Carrier', value: i.carrier }] : [])],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'They arrived',
    cancelLabel: 'Not yet',
  };
}

export function buildReviewDeliveryMyselfConfirm(i: { caller: string; jobId: string; amountUsdc: string }): ReviewDeliveryMyselfConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  return {
    kind: 'confirm',
    id: `review_delivery_myself:${i.jobId}:${confirmNonce()}`,
    intent: 'review_delivery_myself',
    title: 'Review the delivery yourself',
    summary: 'The delivery check has not answered. You check this delivery yourself instead, and your review time starts now.',
    warning: 'The check is skipped for this delivery only and cannot be turned back on for it.',
    fields: [dealField(i.amountUsdc)],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Review it myself',
    cancelLabel: 'Keep waiting',
  };
}

export function buildClaimPaymentConfirm(i: { caller: string; jobId: string; amountUsdc: string }): ClaimPaymentConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  return {
    kind: 'confirm',
    id: `claim_payment:${i.jobId}:${confirmNonce()}`,
    intent: 'claim_payment',
    title: 'Claim your payment',
    summary: 'The buyer did not release or raise a problem in their review time. The next payment on this deal goes to you.',
    warning: 'A payment cannot be undone.',
    fields: [dealField(i.amountUsdc)],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Claim payment',
    cancelLabel: 'Not now',
  };
}

export function buildStillReviewingConfirm(i: { caller: string; jobId: string; stepMs: number; left: number }): StillReviewingConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  if (i.left < 1) return { error: 'They have used all the extra review time this deal allows. Release or raise a problem.' };
  return {
    kind: 'confirm',
    id: `still_reviewing:${i.jobId}:${confirmNonce()}`,
    intent: 'still_reviewing',
    title: 'Ask for more review time',
    summary: `Your review time grows by ${durationText(i.stepMs)}. The seller sees that you are still reviewing.`,
    fields: [
      { label: 'Extra time', value: durationText(i.stepMs) },
      { label: 'Left after this', value: String(i.left - 1) },
    ],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Add review time',
    cancelLabel: 'Not now',
  };
}

export function buildDelayAppealConfirm(i: { caller: string; jobId: string; amountUsdc: string; responseMs: number }): DelayAppealConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  return {
    kind: 'confirm',
    id: `delay_appeal:${i.jobId}:${confirmNonce()}`,
    intent: 'delay_appeal',
    title: 'Ask the buyer to release',
    summary: `The buyer has ${durationText(i.responseMs)} to answer with a reason. With no answer, the payment is released to you.`,
    fields: [dealField(i.amountUsdc), { label: 'Buyer has', value: durationText(i.responseMs) }],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Send',
    cancelLabel: 'Not now',
  };
}

export function buildAnswerDelayAppealConfirm(i: { caller: string; jobId: string; reason: string }): AnswerDelayAppealConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  const reason = i.reason.trim();
  if (!reason) return { error: 'Ask them why they are not releasing yet; the seller sees it.' };
  if (reason.length > 600) return { error: 'Keep the reason under 600 characters.' };
  return {
    kind: 'confirm',
    id: `answer_delay_appeal:${i.jobId}:${confirmNonce()}`,
    intent: 'answer_delay_appeal',
    title: 'Tell the seller why',
    summary: 'The payment stays held until you release it. The seller sees your reason.',
    fields: [{ label: 'Reason', value: reason }],
    payload: { jobId: i.jobId, caller: i.caller, reason },
    confirmLabel: 'Send reason',
    cancelLabel: 'Not now',
  };
}

export function buildTakeBackDealConfirm(i: {
  caller: string;
  jobId: string;
  amountUsdc: string;
  paidIn: boolean;
  /// Paid in and the delivery deadline passed with nothing delivered.
  missedDeadline?: boolean;
}): TakeBackDealConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  const back = `The deal ends and the ${i.amountUsdc} USDC comes back to you.`;
  return {
    kind: 'confirm',
    id: `take_back_deal:${i.jobId}:${confirmNonce()}`,
    intent: 'take_back_deal',
    title: 'Take back this deal',
    summary: i.missedDeadline
      ? `The deadline passed with nothing delivered. ${back}`
      : i.paidIn
        ? `The seller has not accepted. ${back}`
        : 'The seller has not accepted. The deal ends; no money has moved.',
    warning: 'This ends the deal and cannot be undone.',
    fields: [dealField(i.amountUsdc)],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Take it back',
    cancelLabel: 'Keep the deal',
  };
}

export function buildChangeDealTermsConfirm(i: {
  caller: string;
  jobId: string;
  as: 'buyer' | 'seller';
  currentAmountUsdc: string;
  amountUsdc?: number;
  terms?: string;
  deadlineDays?: number;
}): ChangeDealTermsConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  const terms = i.terms?.trim();
  if (i.amountUsdc === undefined && !terms && i.deadlineDays === undefined) {
    return { error: 'Say what to change: the price, what is delivered, or the days to deliver.' };
  }
  if (i.amountUsdc !== undefined && !(i.amountUsdc > 0)) return { error: 'The price must be above 0 USDC.' };
  if (i.deadlineDays !== undefined && (!Number.isInteger(i.deadlineDays) || i.deadlineDays < 1 || i.deadlineDays > 180)) {
    return { error: 'Days to deliver must be a whole number from 1 to 180.' };
  }
  if (terms && terms.length > 4000) return { error: 'Keep what is delivered under 4,000 characters.' };
  const fields = [{ label: 'Price now', value: `${i.currentAmountUsdc} USDC` }];
  if (i.amountUsdc !== undefined) fields.push({ label: 'New price', value: `${i.amountUsdc} USDC` });
  if (terms) fields.push({ label: 'What is delivered', value: terms });
  if (i.deadlineDays !== undefined) fields.push({ label: 'Days to deliver', value: `${i.deadlineDays} from now` });
  const seller = i.as === 'seller';
  return {
    kind: 'confirm',
    id: `change_deal_terms:${i.jobId}:${confirmNonce()}`,
    intent: 'change_deal_terms',
    title: seller ? 'Send a counter' : 'Change the deal',
    summary: seller
      ? 'The buyer sees your terms and agrees or answers. Nothing is paid until they do.'
      : 'The seller is asked to agree to the new terms. Nothing is paid yet.',
    fields,
    payload: {
      jobId: i.jobId,
      caller: i.caller,
      as: i.as,
      ...(i.amountUsdc !== undefined ? { dealAmountUsdc: i.amountUsdc } : {}),
      ...(terms ? { terms } : {}),
      ...(i.deadlineDays !== undefined ? { deadlineDays: i.deadlineDays } : {}),
    },
    confirmLabel: seller ? 'Send counter' : 'Save changes',
    cancelLabel: 'Keep as is',
  };
}

const OFFER_REFUSAL: Record<OfferRuleError, string> = {
  OWN_REQUEST: 'That is their own request.',
  REQUEST_CLOSED: 'That request is no longer taking offers.',
  BAD_PRICE: 'The price must be above 0 USDC, with at most 6 decimals.',
  PRICE_TOO_HIGH: 'That price is far above the budget. Offer a price nearer to it.',
  DATE_PAST: 'The delivery date must be in the future.',
  DATE_TOO_LATE: 'That delivery date is too long after the request is due.',
  NOTE_TOO_LONG: 'Keep the note to 280 characters.',
};

export function buildMakeOfferConfirm(i: {
  me: string;
  jobId: string;
  buyerUser: string;
  briefText: string;
  budgetUsdc: string;
  requestDeadlineUnix: number;
  jobOpen: boolean;
  priceUsdc: number;
  deliverInDays: number;
  note: string;
  nowUnix: number;
}): MakeOfferConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the request id.' };
  if (!Number.isInteger(i.deliverInDays) || i.deliverInDays < 1) return { error: 'Ask how many whole days they need to deliver.' };
  const priceUsdc = String(Number(i.priceUsdc.toFixed(6)));
  const deliverByUnix = i.nowUnix + i.deliverInDays * DAY_SECONDS;
  const note = i.note.trim();
  const rule = checkOffer(
    { priceUsdc, deliverByUnix, note },
    { budgetUsdc: i.budgetUsdc, requestDeadlineUnix: i.requestDeadlineUnix, nowUnix: i.nowUnix, sellerUser: i.me, buyerUser: i.buyerUser, jobOpen: i.jobOpen },
  );
  if (!rule.ok) return { error: OFFER_REFUSAL[rule.code] };
  const brief = i.briefText.length > 120 ? `${i.briefText.slice(0, 117)}...` : i.briefText;
  return {
    kind: 'confirm',
    id: `make_offer:${i.jobId}:${priceUsdc}:${confirmNonce()}`,
    intent: 'make_offer',
    title: `Offer ${priceUsdc} USDC`,
    summary: 'The buyer sees your price, date and note. It replaces any offer your agent made here, and stays open for up to a week.',
    fields: [
      { label: 'Request', value: brief },
      { label: 'Budget', value: `${i.budgetUsdc} USDC` },
      { label: 'Your price', value: `${priceUsdc} USDC` },
      { label: 'Delivered by', value: isoDay(deliverByUnix) },
      ...(note ? [{ label: 'Note', value: note }] : []),
    ],
    payload: { jobId: i.jobId, priceUsdc, deliverByUnix, note },
    confirmLabel: 'Send offer',
    cancelLabel: 'Not now',
  };
}

export function buildWithdrawOfferConfirm(i: { jobId: string; offerId: string; priceUsdc: string }): WithdrawOfferConfirm | { error: string } {
  if (!i.jobId || !i.offerId) return { error: 'Missing which offer to withdraw.' };
  return {
    kind: 'confirm',
    id: `withdraw_offer:${i.offerId}:${confirmNonce()}`,
    intent: 'withdraw_offer',
    title: 'Withdraw your offer',
    summary: 'The buyer no longer sees it. You can make a new one while the request is open.',
    fields: [{ label: 'Your price', value: `${i.priceUsdc} USDC` }],
    payload: { jobId: i.jobId, offerId: i.offerId },
    confirmLabel: 'Withdraw',
    cancelLabel: 'Keep it',
  };
}

export function buildAcceptSellerOfferConfirm(i: {
  jobId: string;
  offerId: string;
  sellerLabel: string;
  priceUsdc: string;
  fundedUsdc?: string;
  deliverByUnix: number;
}): AcceptSellerOfferConfirm | { error: string } {
  if (!i.jobId || !i.offerId) return { error: 'Missing which offer to take.' };
  const total = i.fundedUsdc ?? i.priceUsdc;
  return {
    kind: 'confirm',
    id: `accept_offer:${i.offerId}:${confirmNonce()}`,
    intent: 'accept_offer',
    title: `Take ${i.sellerLabel}'s offer`,
    summary: `${total} USDC goes into escrow from your buying agent and the deal starts. It stays protected until you release it.`,
    fields: [
      { label: 'Seller', value: i.sellerLabel },
      { label: 'Price', value: `${i.priceUsdc} USDC` },
      ...(i.fundedUsdc && i.fundedUsdc !== i.priceUsdc ? [{ label: 'Paid in with the fee', value: `${i.fundedUsdc} USDC` }] : []),
      { label: 'Delivered by', value: isoDay(i.deliverByUnix) },
    ],
    payload: { jobId: i.jobId, offerId: i.offerId },
    confirmLabel: `Take it and pay ${total} USDC`,
    cancelLabel: 'Not now',
  };
}

export function buildNearMissConfirm(i: {
  caller: string;
  jobId: string;
  decision: 'proceed' | 'pass';
  askedSide: 'buyer' | 'seller';
  priceUsdc: string;
}): NearMissProceedConfirm | NearMissPassConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the request id.' };
  const price = { label: 'Price they reached', value: `${i.priceUsdc} USDC` };
  if (i.decision === 'pass') {
    return {
      kind: 'confirm',
      id: `near_miss_pass:${i.jobId}:${confirmNonce()}`,
      intent: 'near_miss_pass',
      title: 'Pass on this price',
      summary: i.askedSide === 'buyer'
        ? 'Nothing is paid. The request stays open for other offers, and this price can be brought back while it is open.'
        : 'Nothing changes for you. The buyer keeps looking.',
      fields: [price],
      payload: { jobId: i.jobId, caller: i.caller },
      confirmLabel: 'Pass',
      cancelLabel: 'Decide later',
    };
  }
  return {
    kind: 'confirm',
    id: `near_miss_proceed:${i.jobId}:${confirmNonce()}`,
    intent: 'near_miss_proceed',
    title: `Go ahead at ${i.priceUsdc} USDC`,
    summary: i.askedSide === 'buyer'
      ? `The deal starts at ${i.priceUsdc} USDC, outside the limits you set. Your buying agent pays it into escrow now.`
      : `The deal starts at ${i.priceUsdc} USDC, below what your agent would take. The buyer pays it into escrow now.`,
    warning: 'This starts the deal and pays the escrow.',
    fields: [price],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Go ahead',
    cancelLabel: 'Not now',
  };
}

export function buildReconsiderOfferConfirm(i: { caller: string; jobId: string; priceUsdc: string }): ReconsiderOfferConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the request id.' };
  return {
    kind: 'confirm',
    id: `reconsider_offer:${i.jobId}:${confirmNonce()}`,
    intent: 'reconsider_offer',
    title: 'Bring back the price you passed',
    summary: 'Nothing is paid yet. The near match comes back so you can go ahead at that price.',
    fields: [{ label: 'Price', value: `${i.priceUsdc} USDC` }],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Bring it back',
    cancelLabel: 'Not now',
  };
}

export function buildEditListingConfirm(i: {
  caller: string;
  listingId: string;
  currentTitle: string;
  currentPriceUsdc: string;
  title?: string;
  description?: string;
  askingPriceUsdc?: number;
}): EditListingConfirm | { error: string } {
  if (!i.listingId) return { error: 'Missing the offer id.' };
  const title = i.title?.trim();
  const description = i.description?.trim();
  if (!title && !description && i.askingPriceUsdc === undefined) return { error: 'Say what to change: the title, the description or the price.' };
  if (title && (title.length < 3 || title.length > 120)) return { error: 'The title must be 3 to 120 characters.' };
  if (description && (description.length < 5 || description.length > 500)) return { error: 'The description must be 5 to 500 characters.' };
  if (i.askingPriceUsdc !== undefined && !(i.askingPriceUsdc > 0)) return { error: 'The price must be above 0 USDC.' };
  const fields = [{ label: 'Offer', value: i.currentTitle }];
  if (title) fields.push({ label: 'New title', value: title });
  if (description) fields.push({ label: 'New description', value: description });
  if (i.askingPriceUsdc !== undefined) fields.push({ label: 'Price', value: `${i.currentPriceUsdc} to ${i.askingPriceUsdc} USDC` });
  return {
    kind: 'confirm',
    id: `edit_listing:${i.listingId}:${confirmNonce()}`,
    intent: 'edit_listing',
    title: 'Update your offer',
    summary: 'The market shows the new details from now on. Your seller agent uses the new price.',
    fields,
    payload: {
      listingId: i.listingId,
      caller: i.caller,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(i.askingPriceUsdc !== undefined ? { askingPriceUsdc: i.askingPriceUsdc } : {}),
    },
    confirmLabel: 'Save changes',
    cancelLabel: 'Keep as is',
  };
}

export function buildStopAgentBidConfirm(i: { jobId: string; briefText: string }): StopAgentBidConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the request id.' };
  const brief = i.briefText.length > 120 ? `${i.briefText.slice(0, 117)}...` : i.briefText;
  return {
    kind: 'confirm',
    id: `stop_agent_bid:${i.jobId}:${confirmNonce()}`,
    intent: 'stop_agent_bid',
    title: 'Stop bidding on this request',
    summary: 'Your seller agent stops negotiating here. You can still make your own offer.',
    fields: [{ label: 'Request', value: brief }],
    payload: { jobId: i.jobId },
    confirmLabel: 'Stop bidding',
    cancelLabel: 'Keep bidding',
  };
}

export function buildConfirmGoodsReceivedConfirm(i: { address: string; jobId: string; amountUsdc: string; podHash: string }): ConfirmGoodsReceivedConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  return {
    kind: 'confirm',
    id: `confirm_goods_received:${i.jobId}:${confirmNonce()}`,
    intent: 'confirm_goods_received',
    title: 'Confirm you received the goods',
    summary: 'This records on the trade record that the goods reached you. It does not pay the seller.',
    warning: 'A confirmation on the trade record cannot be taken back.',
    fields: [{ label: 'Deal', value: `${i.amountUsdc} USDC` }],
    payload: { address: i.address, invoiceId: i.jobId, podHash: i.podHash },
    confirmLabel: 'Confirm received',
    cancelLabel: 'Not yet',
  };
}
