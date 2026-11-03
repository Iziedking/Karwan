import type { DirectDeal } from '@/core/api';
import { moneySplit } from '@/features/deals/workspace/dealSteps';

const MICROS = 1_000_000n;

function toMicros(usdc: string): bigint {
  const [whole = '0', fraction = ''] = usdc.split('.');
  return BigInt(whole || '0') * MICROS + BigInt((fraction + '000000').slice(0, 6));
}

function fromMicros(micros: bigint): string {
  const whole = micros / MICROS;
  const fraction = (micros % MICROS).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/// What Karwan holds in the person's own deals as the buyer (view 44, P7):
/// the money in, less what was paid out. Null while the deals load, so the
/// page never says nothing is held by mistake.
export function heldInDeals(deals: DirectDeal[] | undefined, me: string): string | null {
  if (!deals) return null;
  return fromMicros(holding(deals, me).reduce((sum, h) => sum + h.micros, 0n));
}

/// The deals that total is made of, the most held first (view 48, the side
/// card on a wide screen).
export function heldDeals(deals: DirectDeal[] | undefined, me: string): Array<{ deal: DirectDeal; held: string }> {
  return holding(deals ?? [], me)
    .filter((h) => h.micros > 0n)
    .sort((a, b) => (b.micros > a.micros ? 1 : b.micros < a.micros ? -1 : 0))
    .map((h) => ({ deal: h.deal, held: fromMicros(h.micros) }));
}

function holding(deals: DirectDeal[], me: string) {
  const mine = me.toLowerCase();
  return deals
    .filter((d) => d.buyer.toLowerCase() === mine && !d.settledAt)
    .map((deal) => ({ deal, micros: toMicros(moneySplit(deal)?.heldUsdc ?? '0') }));
}
