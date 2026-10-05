/// Money a payment link received at its own addresses. A payer can send from an
/// exchange or any wallet, so the amount that lands is whatever they sent: the
/// request counts every transfer once, reads paid when the total covers it, and
/// keeps money that arrives after it closed so it is still delivered.

import { usdcToMicros, type DepositRequest, type RequestReceipt } from './depositRequests.js';

export type IncomingOutcome = 'paid' | 'part' | 'late' | 'duplicate';

export function receivedMicros(request: DepositRequest): bigint {
  return (request.receipts ?? []).reduce((sum, r) => sum + usdcToMicros(r.amountUsdc), 0n);
}

export function microsToUsdc(micros: bigint): string {
  const whole = micros / 1_000_000n;
  const fraction = (micros % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/// What is still owed. A request with no fixed amount owes nothing once paid.
export function remainingUsdc(request: DepositRequest): string {
  if (!request.amountUsdc) return '0';
  const left = usdcToMicros(request.amountUsdc) - receivedMicros(request);
  return left > 0n ? microsToUsdc(left) : '0';
}

export function applyIncoming(
  request: DepositRequest,
  input: { txId: string; amountUsdc: string; chain: string; now: number },
): { request: DepositRequest; outcome: IncomingOutcome } {
  if ((request.receipts ?? []).some((r) => r.txId === input.txId)) return { request, outcome: 'duplicate' };
  const receipt: RequestReceipt = { txId: input.txId, amountUsdc: input.amountUsdc, chain: input.chain, at: input.now };
  const withReceipt: DepositRequest = { ...request, receipts: [...(request.receipts ?? []), receipt], updatedAt: input.now };
  const isOpen = request.status === 'open' && request.expiresAt > input.now;
  if (!isOpen) return { request: withReceipt, outcome: 'late' };
  const covered = !request.amountUsdc || receivedMicros(withReceipt) >= usdcToMicros(request.amountUsdc);
  if (!covered) return { request: withReceipt, outcome: 'part' };
  return {
    request: { ...withReceipt, status: 'matched', matchedTxId: input.txId, matchedChain: input.chain, matchedAt: input.now },
    outcome: 'paid',
  };
}
