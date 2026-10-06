/// Who may end a match before it funds. The seller declines one waiting on
/// them; the buyer can withdraw it while the seller has not accepted, so a
/// silent seller never holds the request until its deadline. After a seller
/// raises the price the buyer alone decides.
export function matchDecliner(
  proposal: { buyerUser: string; sellerUser: string; awaitingParty?: 'buyer' | 'seller'; raisedPriceUsdc?: string },
  caller: string,
): { ok: true; by: 'buyer' | 'seller' } | { ok: false; message: string } {
  const who = caller.toLowerCase();
  const buyer = proposal.buyerUser.toLowerCase();
  const seller = proposal.sellerUser.toLowerCase();
  const pendingRaise = proposal.awaitingParty === 'buyer' && !!proposal.raisedPriceUsdc;
  if (who === buyer) return { ok: true, by: 'buyer' };
  if (who === seller && !pendingRaise) return { ok: true, by: 'seller' };
  return { ok: false, message: pendingRaise ? 'only the buyer can decline the raised price' : 'only the two parties can decline this match' };
}
