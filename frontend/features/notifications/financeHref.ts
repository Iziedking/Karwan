/// Where a finance notice opens. A financier is not a party to the deal, whose
/// page is private to its buyer and seller, so their notices open their own
/// position, or the financier desk for a new request; the seller's open the deal.
export function financeHref(input: { role: string | null; jobId: string; payload: Record<string, unknown> | undefined }): string {
  if (input.role === 'financier') {
    const offerId = input.payload?.offerId;
    const lineId = input.payload?.lineId;
    if (typeof offerId === 'string' && offerId) return `/financier/factoring/${encodeURIComponent(offerId)}`;
    if (typeof lineId === 'string' && lineId) return `/financier/po/${encodeURIComponent(lineId)}`;
    return '/financier';
  }
  return input.jobId ? `/deals/${input.jobId}` : '/financier';
}
