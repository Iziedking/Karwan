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
