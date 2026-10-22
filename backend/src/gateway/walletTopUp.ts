/// Send uses the whole balance (architecture view 22). When the Arc wallet
/// alone is short, the missing part moves from the pooled balance into the
/// person's own wallet first, then the send goes out as usual. These are the
/// pure decisions; gateway/spend.ts does the moving.

export type SendPlan =
  | { kind: 'wallet' }
  | { kind: 'topUp'; shortfall: number }
  | { kind: 'insufficient'; available: number };

const CENT = 100;
const cents = (n: number) => Math.round(n * CENT) / CENT;
/// Up to the next cent, so a top-up never lands a fraction short.
const centsUp = (n: number) => Math.ceil(Math.round(n * 1e6) / 1e4) / CENT;

export function sendPlan(input: { amount: number; wallet: number; pool: number }): SendPlan {
  if (input.amount <= input.wallet) return { kind: 'wallet' };
  if (input.amount <= cents(input.wallet + input.pool)) return { kind: 'topUp', shortfall: centsUp(input.amount - input.wallet) };
  return { kind: 'insufficient', available: cents(input.wallet + input.pool) };
}

interface Fee {
  type: string;
  amount: string;
}

/// How much to move so that `shortfall` arrives in the wallet. The Forwarding
/// Service fee comes out of the minted amount, so it is added on top; gas and
/// the provider fee come out of the pool, so the pool must cover them too
/// (docs.arc.io app-kit/concepts/unified-balance-fees, read 22 Oct 2026).
export function topUpAmount(shortfall: number, fees: readonly Fee[], pool: number): { ok: true; amount: number } | { ok: false } {
  const sum = (match: (f: Fee) => boolean) => fees.filter(match).reduce((s, f) => s + Number(f.amount || 0), 0);
  const forwarder = sum((f) => f.type === 'forwarder');
  const fromPool = sum((f) => f.type !== 'forwarder');
  const amount = centsUp(shortfall + forwarder);
  return amount + fromPool <= pool + 1e-9 ? { ok: true, amount } : { ok: false };
}
