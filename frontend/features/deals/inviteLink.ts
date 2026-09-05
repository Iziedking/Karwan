/// One canonical, source-neutral invite URL. The public link carries no
/// private terms, email address, wallet address, or payment instruction.
/// DirectDealDetail and the public invite page both consume this helper so a
/// share action cannot accidentally include the current page hash or query.
export function buildInviteUrl(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/invite/${encodeURIComponent(token)}`;
}
