import { confirmNonce, type ConfirmActionBase } from './actions.js';
import { parseStatement } from '../deals/disputeJudge.js';

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
  payload: { jobId: string; caller: string; seller: string };
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
export interface DeclineDealConfirm extends ConfirmActionBase {
  intent: 'decline_deal';
  payload: { jobId: string; caller: string; note: string };
}

export type DealStepConfirm =
  | ChooseOfferConfirm
  | EditRequestConfirm
  | RaiseOfferConfirm
  | RequestExtensionConfirm
  | RespondExtensionConfirm
  | CancelDealConfirm
  | DisputeStatementConfirm
  | EscalateDisputeConfirm
  | DeclineDealConfirm;

export function buildChooseOfferConfirm(i: {
  caller: string;
  jobId: string;
  seller: string;
  sellerLabel: string;
  priceUsdc: string;
}): ChooseOfferConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the request id.' };
  if (!i.seller) return { error: 'Missing which offer to choose.' };
  return {
    kind: 'confirm',
    id: `choose_offer:${i.jobId}:${i.seller.toLowerCase()}:${confirmNonce()}`,
    intent: 'choose_offer',
    title: 'Choose this offer',
    summary: `Go with ${i.sellerLabel} at ${i.priceUsdc} USDC and start the deal.`,
    warning: 'This funds the escrow from your buyer agent. The money stays protected until the work is delivered or the deal is cancelled.',
    fields: [
      { label: 'Seller', value: i.sellerLabel },
      { label: 'Price', value: `${i.priceUsdc} USDC` },
      { label: 'Request', value: shortId(i.jobId) },
    ],
    payload: { jobId: i.jobId, caller: i.caller, seller: i.seller },
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
  reason?: string;
}): RequestExtensionConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  if (!Number.isInteger(i.days) || i.days < 1 || i.days > MAX_EXTENSION_DAYS) {
    return { error: `Ask for between 1 and ${MAX_EXTENSION_DAYS} whole days.` };
  }
  const additionalSeconds = i.days * DAY_SECONDS;
  const reason = i.reason?.trim();
  return {
    kind: 'confirm',
    id: `request_extension:${i.jobId}:${i.days}:${confirmNonce()}`,
    intent: 'request_extension',
    title: 'Ask for more time',
    summary: `The buyer approves or declines. Until then the current deadline stands.`,
    fields: [
      { label: 'Extra time', value: `${i.days} day${i.days === 1 ? '' : 's'}` },
      { label: 'Current deadline', value: isoDay(i.currentDeadlineUnix) },
      { label: 'New deadline', value: isoDay(i.currentDeadlineUnix + additionalSeconds) },
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
