import type { DepositRequestPublic } from '@/core/api';

/// Where a payment sent from another chain stands, as the payer sees it.
export type ChainPayState =
  | { phase: 'waiting'; sendUsdc: string }
  | { phase: 'part'; got: string; total: string; sendUsdc: string; chain: string; delivery: 'moving' | 'delivered' | 'delayed' }
  | { phase: 'moving' | 'delivered'; chain: string }
  | { phase: 'delayed'; chain: string };

export function chainPayState(request: DepositRequestPublic): ChainPayState {
  const last = request.payments?.at(-1);
  if (!last) return { phase: 'waiting', sendUsdc: request.amountUsdc ?? '' };
  const delivery = last.delivery ?? 'moving';
  if (request.status === 'open' && request.remainingUsdc && request.remainingUsdc !== '0') {
    return {
      phase: 'part',
      got: request.receivedUsdc ?? last.amountUsdc,
      total: request.amountUsdc ?? '',
      sendUsdc: request.remainingUsdc,
      chain: last.chain,
      delivery,
    };
  }
  return { phase: delivery, chain: last.chain };
}

/// Where the payer goes once the request is paid: a member goes home, anyone
/// else is offered an account, never the landing page.
export function afterPaid(signedIn: boolean): { kind: 'home'; href: string } | { kind: 'join' } {
  return signedIn ? { kind: 'home', href: '/app' } : { kind: 'join' };
}
