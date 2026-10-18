import { api, ApiError, type FactoringOffer } from '@/core/api';

export type AcceptErrorKind = 'authorization' | 'reconcile' | 'alreadyAssigned' | 'windowClosed' | 'notAccepted';

type AcceptCall = (body: { offerId: string; assignTxHash?: string }) => Promise<{ offer: FactoringOffer }>;

/// Accepting is one on-chain call: the registry relays the financier's signed
/// advance to the seller and assigns the receivable in the same transaction.
/// The registry only takes it from the seller the escrow records, which is the
/// seller's Karwan agent wallet for every account, so Karwan sends it from
/// there; a browser wallet would be rejected as not a party. A previous accept
/// that landed on chain but stopped before its receipt is finished with its
/// hash instead of being sent again.
export async function acceptOffer(offer: FactoringOffer, accept: AcceptCall = api.acceptFactoringOffer): Promise<FactoringOffer> {
  const r = await accept({ offerId: offer.id, assignTxHash: offer.advanceTxHash ?? undefined });
  return r.offer;
}

export function rawAcceptError(e: unknown): string {
  return e instanceof ApiError ? `${e.message}${typeof e.detail === 'string' ? `: ${e.detail}` : ''}` : (e as Error).message;
}

export function acceptErrorKind(raw: string): AcceptErrorKind | null {
  const lower = raw.toLowerCase();
  if (lower.includes('authorization') || lower.includes('transferwithauthorization')) return 'authorization';
  if (lower.includes('receipt-reconciliation-required') || lower.includes('receipt still needs reconciliation')) return 'reconcile';
  if (lower.includes('alreadyassigned') || lower.includes('already assigned')) return 'alreadyAssigned';
  if (lower.includes('podlocked') || lower.includes('delivery')) return 'windowClosed';
  if (lower.includes('tx failed') || lower.includes('assignreceivable') || lower.includes('advance and assignment failed')) return 'notAccepted';
  return null;
}
