import type { TrustView } from '@/core/api';

export interface ProtectionCopy {
  title: string;
  escrow: string;
  you: string;
  buyer: string;
  seller: string;
  reasons: Record<'first_deal' | 'large_deal' | 'fast_new_account' | 'flagged_link_before', string>;
  stake: string;
  github: string;
  offMarket: string;
  belowMarket: string;
}

/// The lines under "Protection on this deal", in the order a person reads
/// them: the money, who proves they are a person and why, then the checks.
export function protectionLines(
  view: TrustView | undefined,
  viewer: 'buyer' | 'seller',
  copy: ProtectionCopy,
  stakePct?: number,
): string[] {
  const lines = [copy.escrow];
  for (const role of ['buyer', 'seller'] as const) {
    const reason = view?.verify[role];
    if (!reason) continue;
    const who = role === viewer ? copy.you : copy[role];
    lines.push(reason === 'check' ? who : `${who} · ${copy.reasons[reason]}`);
  }
  if (stakePct) lines.push(copy.stake.replace('{pct}', String(stakePct)));
  if (view?.delivery === 'github') lines.push(copy.github);
  if (view?.reasons.includes('off_market_price')) lines.push(copy.offMarket);
  if (view?.reasons.includes('below_market_price')) lines.push(copy.belowMarket);
  return lines;
}
