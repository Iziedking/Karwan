/// Whether the seller may have earnings from this deal to cash out: released,
/// and after a ruling only when the seller got a share. A financed deal stays
/// open: the escrow repays the financier first and pays the seller the rest.
export function cashoutOpen(
  deal: { settledAt?: number; cancelKind?: string; resolvedSellerBps?: number },
  viewerIsSeller: boolean,
): boolean {
  if (!viewerIsSeller || !deal.settledAt) return false;
  if (deal.cancelKind === 'resolved') return (deal.resolvedSellerBps ?? 0) > 0;
  return true;
}
