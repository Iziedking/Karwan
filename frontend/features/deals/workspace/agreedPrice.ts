import type { DirectDeal } from '@/core/api';

const MICROS = 1_000_000n;

function toMicros(usdc: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdc.trim());
  return m ? BigInt(m[1]!) * MICROS + BigInt((m[2] ?? '').padEnd(6, '0')) : null;
}

function fromMicros(micros: bigint): string {
  const fraction = (micros % MICROS).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${micros / MICROS}.${fraction}` : `${micros / MICROS}`;
}

export interface AgreedPrice {
  agreed: string;
  posted: string;
  /// What each stage pays, from the escrow's split. One stage lists nothing.
  stages: string[];
}

/// The price the escrow holds next to the one the request was posted with,
/// when an accepted offer changed it (owner, 5 Nov 2026). The signed text and
/// its hash stay untouched; this only says what the money is.
export function agreedPrice(deal: Pick<DirectDeal, 'dealAmountUsdc' | 'postedPriceUsdc' | 'milestonePcts' | 'onChain'>): AgreedPrice | null {
  if (!deal.postedPriceUsdc) return null;
  const total = toMicros(deal.dealAmountUsdc);
  if (total === null) return null;
  const pcts = deal.onChain?.milestonePcts?.length ? deal.onChain.milestonePcts : deal.milestonePcts ?? [];
  const stages = pcts.length > 1 ? pcts.map((pct) => fromMicros((total * BigInt(pct)) / 100n)) : [];
  return { agreed: fromMicros(total), posted: deal.postedPriceUsdc, stages };
}
