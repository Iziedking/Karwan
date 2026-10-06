/// Whether the seller has earnings from this deal to cash out: released, not
/// paid to a financier, and, after a ruling, only when the seller got a share.
export function cashoutOpen(
  deal: { settledAt?: number; cancelKind?: string; resolvedSellerBps?: number; factoringOfferId?: string; poFinancingId?: string },
  viewerIsSeller: boolean,
): boolean {
  if (!viewerIsSeller || !deal.settledAt) return false;
  if (deal.factoringOfferId || deal.poFinancingId) return false;
  if (deal.cancelKind === 'resolved') return (deal.resolvedSellerBps ?? 0) > 0;
  return true;
}
