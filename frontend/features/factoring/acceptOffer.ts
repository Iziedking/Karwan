import type { WalletClient } from 'viem';
import { api, ApiError, type FactoringOffer } from '@/core/api';

export type AcceptErrorKind = 'authorization' | 'reconcile' | 'alreadyAssigned' | 'windowClosed' | 'notAccepted';

/// Thrown when a web3 seller has no wallet connected to send the assignment.
export class WalletNeededError extends Error {}

const assignReceivableAbi = [
  {
    type: 'function',
    name: 'assignReceivable',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'invoiceId', type: 'bytes32' },
      { name: 'financier', type: 'address' },
      { name: 'repayUsdc', type: 'uint128' },
      { name: 'advanceUsdc', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

/// Accepting is one on-chain call: the registry relays the financier's signed
/// advance to the seller and assigns the receivable to them in the same
/// transaction, so the seller is never assigned but unpaid. The call is
/// seller-gated: a web3 seller sends it; a Circle seller's identity wallet has
/// it signed by the backend. A previous accept that landed on chain but stopped
/// before its Karwan receipt reuses its hash instead of sending a second call.
export async function acceptOfferOnChain(input: {
  offer: FactoringOffer;
  isCircleUser: boolean;
  walletClient: WalletClient | undefined;
  address: string | null | undefined;
}): Promise<FactoringOffer> {
  const { offer, isCircleUser, walletClient, address } = input;
  let assignTxHash: string | undefined;
  if (offer.advanceTxHash) {
    assignTxHash = offer.advanceTxHash;
  } else if (!isCircleUser) {
    if (!walletClient || !address) throw new WalletNeededError();
    const p = await api.factoringAssignmentParams(offer.id);
    assignTxHash = await walletClient.writeContract({
      address: p.registry,
      abi: assignReceivableAbi,
      functionName: 'assignReceivable',
      args: [
        p.invoiceId,
        p.financier,
        BigInt(p.repayUsdc),
        BigInt(p.advanceUsdc),
        BigInt(p.validAfter),
        BigInt(p.validBefore),
        p.nonce,
        p.v,
        p.r,
        p.s,
      ],
      chain: walletClient.chain,
      account: address as `0x${string}`,
    });
  }
  const r = await api.acceptFactoringOffer({ offerId: offer.id, assignTxHash });
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
