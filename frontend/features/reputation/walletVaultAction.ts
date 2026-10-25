import type { WalletClient } from 'viem';
import { api } from '@/core/api';
import { requireConfirmedTx } from '@/shared/chain/confirmTx';
import { KARWAN_VAULT_ADDRESS } from '../profile/config';

export const vaultAbi = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'requestWithdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelWithdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
] as const;

export type VaultPositionAction = 'requestWithdraw' | 'cancelWithdraw' | 'claim';

/// One deal insurance step on one position, signed by the person's own wallet:
/// recorded first, signed, waited on, then marked done. The deal insurance
/// page and the assistant's card both run it.
export async function runWalletVaultAction(i: {
  address: `0x${string}`;
  positionId: string;
  action: VaultPositionAction;
  walletClient: WalletClient;
  arcClient: Parameters<typeof requireConfirmedTx>[0];
  revertedText: string;
  /// Told the movement's reference as soon as it is recorded.
  onReference?: (reference: string) => void;
}): Promise<{ txHash: `0x${string}`; reference: string }> {
  const requestId = crypto.randomUUID();
  const intent = await api.vaultActionIntent({ address: i.address, positionId: i.positionId, action: i.action, requestId });
  i.onReference?.(intent.reference);
  const hash = await i.walletClient.writeContract({
    address: KARWAN_VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: i.action,
    args: [BigInt(i.positionId)],
    chain: i.walletClient.chain,
    account: i.address,
  });
  await requireConfirmedTx(i.arcClient, hash, i.revertedText);
  const completed = await api.vaultActionComplete({ address: i.address, positionId: i.positionId, action: i.action, requestId, txHash: hash });
  return { txHash: hash, reference: completed.reference };
}
