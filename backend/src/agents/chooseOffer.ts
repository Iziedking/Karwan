/// The person who posted a request owns it. The request is posted on chain by
/// their buying agent, so the agent address never stands in for the person.
export function isRequestOwner(caller: string, brief: { postedBy?: string }): boolean {
  return !!brief.postedBy && brief.postedBy.toLowerCase() === caller.toLowerCase();
}

export type OfferChoice =
  | { ok: true; seller: string; priceUsdc: string }
  | { ok: false; code: 'NO_OFFER' | 'ALREADY_FUNDED' | 'ALREADY_APPROVED' | 'CLOSED'; message: string };

/// The buyer picks an offer themselves. It is taken at the seller's own price,
/// which is the seller's consent, so it funds without another approval step.
export function offerToChoose(
  bids: ReadonlyArray<{ seller: string; priceUsdc: string }>,
  seller: string,
  state: { funded: boolean; approved: boolean; closed: boolean },
): OfferChoice {
  if (state.closed) return { ok: false, code: 'CLOSED', message: 'This request has closed. Post it again to get new offers.' };
  if (state.funded) return { ok: false, code: 'ALREADY_FUNDED', message: 'This request already has a funded deal.' };
  if (state.approved) return { ok: false, code: 'ALREADY_APPROVED', message: 'This request already has an agreed match.' };
  const bid = bids.find((b) => b.seller.toLowerCase() === seller.toLowerCase());
  if (!bid) return { ok: false, code: 'NO_OFFER', message: 'This seller has no open offer on the request.' };
  return { ok: true, seller: bid.seller, priceUsdc: bid.priceUsdc };
}

/// The seller who agreed a price with the buyer's agent is chosen at that
/// price, which they already consented to. Everyone else keeps their own ask.
export function withAgreedPrice<B extends { seller: string; priceUsdc: string }>(
  bids: readonly B[],
  agreed: { sellerAgent: string; agreedPriceUsdc: string; declinedAt?: number } | null | undefined,
): B[] {
  if (!agreed || agreed.declinedAt) return [...bids];
  const seller = agreed.sellerAgent.toLowerCase();
  return bids.map((b) => (b.seller.toLowerCase() === seller ? { ...b, priceUsdc: agreed.agreedPriceUsdc } : b));
}

export type ApprovalGate = { ok: true } | { ok: false; status: 403 | 409; code: 'buyer-chooses' | 'not-buyer' | 'not-seller' };

/// Who may approve an agent's match. Normally the seller, or the buyer after a
/// seller raise. In shortlist mode the buyer chooses from the list first, so a
/// seller's approval would move money without the buyer's say.
export function approvalGate(input: {
  shortlistMode: boolean;
  pendingRaise: boolean;
  caller: string;
  buyer: string;
  seller: string;
}): ApprovalGate {
  const caller = input.caller.toLowerCase();
  if (input.pendingRaise) {
    return caller === input.buyer.toLowerCase() ? { ok: true } : { ok: false, status: 403, code: 'not-buyer' };
  }
  if (input.shortlistMode) return { ok: false, status: 409, code: 'buyer-chooses' };
  return caller === input.seller.toLowerCase() ? { ok: true } : { ok: false, status: 403, code: 'not-seller' };
}

/// The price on the confirm step the buyer saw must still be the price, so a
/// counter that lands while the sheet is open never changes what is funded.
/// No expected price (older clients) keeps the old behaviour.
export function priceAsSeen(price: string, expected: string | number | undefined): boolean {
  if (expected === undefined) return true;
  return Math.abs(Number(price) - Number(expected)) < 0.000001;
}
