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
  const mine = me.toLowerCase();
  const total = deals
    .filter((d) => d.buyer.toLowerCase() === mine && !d.settledAt)
    .reduce((sum, d) => sum + toMicros(moneySplit(d)?.heldUsdc ?? '0'), 0n);
  return fromMicros(total);
}
