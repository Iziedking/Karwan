/// Withdraw starts with how much and where (view 44, P8). The money then moves
/// through the existing out rails, which keep their own limits and checks.

export type WithdrawDestination = 'wallet' | 'karwan';
export type WithdrawCheck = { ok: true } | { ok: false; reason: 'amount' | 'over' | 'destination' | 'address' };

const AMOUNT = /^\d+(\.\d{1,6})?$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function withdrawReady(input: { amount: string; available: number | null; destination: WithdrawDestination | null; address: string }): WithdrawCheck {
  const amount = input.amount.trim();
  if (!AMOUNT.test(amount) || Number(amount) <= 0) return { ok: false, reason: 'amount' };
  if (input.available !== null && Math.round(Number(amount) * 1e6) > Math.round(input.available * 1e6)) return { ok: false, reason: 'over' };
  if (!input.destination) return { ok: false, reason: 'destination' };
  if (input.destination === 'wallet' && !ADDRESS.test(input.address.trim())) return { ok: false, reason: 'address' };
  return { ok: true };
}
