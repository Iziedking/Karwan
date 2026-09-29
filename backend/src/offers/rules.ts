import { parseUnits } from 'viem';

/// What makes a seller's own offer on a request acceptable. Pure, so the route,
/// the service and the tests all agree on one set of rules.

export type OfferInput = { priceUsdc: string; deliverByUnix: number; note: string };
export type OfferContext = {
  budgetUsdc: string;
  requestDeadlineUnix: number;
  nowUnix: number;
  sellerUser: string;
  buyerUser: string;
  jobOpen: boolean;
};
export type OfferRuleError =
  | 'OWN_REQUEST'
  | 'REQUEST_CLOSED'
  | 'BAD_PRICE'
  | 'PRICE_TOO_HIGH'
  | 'DATE_PAST'
  | 'DATE_TOO_LATE'
  | 'NOTE_TOO_LONG';

export const OFFER_LIFETIME_SECONDS = 7 * 24 * 3600;
const LATE_GRACE_SECONDS = 30 * 24 * 3600;
const NOTE_MAX = 280;
const MONEY = /^\d+(\.\d{1,6})?$/;

const micros = (usdc: string) => parseUnits(usdc, 6);

export function checkOffer(input: OfferInput, ctx: OfferContext): { ok: true } | { ok: false; code: OfferRuleError } {
  if (ctx.sellerUser.toLowerCase() === ctx.buyerUser.toLowerCase()) return { ok: false, code: 'OWN_REQUEST' };
  if (!ctx.jobOpen) return { ok: false, code: 'REQUEST_CLOSED' };
  if (!MONEY.test(input.priceUsdc) || micros(input.priceUsdc) <= 0n) return { ok: false, code: 'BAD_PRICE' };
  if (micros(input.priceUsdc) > micros(ctx.budgetUsdc) * 10n) return { ok: false, code: 'PRICE_TOO_HIGH' };
  if (input.deliverByUnix <= ctx.nowUnix) return { ok: false, code: 'DATE_PAST' };
  if (input.deliverByUnix > ctx.requestDeadlineUnix + LATE_GRACE_SECONDS) return { ok: false, code: 'DATE_TOO_LATE' };
  if ([...input.note].length > NOTE_MAX) return { ok: false, code: 'NOTE_TOO_LONG' };
  return { ok: true };
}

/// An offer stays open for a week, or until the request itself closes.
export function offerLapsesAt(createdAtUnix: number, requestDeadlineUnix: number): number {
  return Math.min(createdAtUnix + OFFER_LIFETIME_SECONDS, requestDeadlineUnix);
}

export function isAboveBudget(priceUsdc: string, budgetUsdc: string): boolean {
  return micros(priceUsdc) > micros(budgetUsdc);
}
