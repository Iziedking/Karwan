import { parseUnits, type WalletClient } from 'viem';
import { api } from '@/core/api';
import { requireConfirmedTx } from '@/shared/chain/confirmTx';
import { ARC_USDC_ADDRESS, ARC_USDC_DECIMALS, KARWAN_VAULT_ADDRESS } from '../profile/config';

const approveAbi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

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

/// Putting money into deal insurance from the person's own wallet: the receipt
/// is recorded before either signature, then an exact approval and the
/// deposit, each waited on. The deal insurance page and the assistant's card
/// both run it.
export async function runWalletVaultDeposit(i: {
  address: `0x${string}`;
  amountUsdc: number;
  walletClient: WalletClient;
  arcClient: Parameters<typeof requireConfirmedTx>[0];
  revertedText: string;
  onReference?: (reference: string) => void;
}): Promise<{ txHash: `0x${string}`; reference: string }> {
  const amountWei = parseUnits(i.amountUsdc.toString(), ARC_USDC_DECIMALS);
  const requestId = crypto.randomUUID();
  const intent = await api.vaultDepositIntent({ address: i.address, amountUsdc: i.amountUsdc, requestId });
  i.onReference?.(intent.reference);
  // A fresh exact allowance every time keeps the two-leg receipt provable even
  // when an older allowance exists.
  const approvalTxHash = await i.walletClient.writeContract({
    address: ARC_USDC_ADDRESS,
    abi: approveAbi,
    functionName: 'approve',
    args: [KARWAN_VAULT_ADDRESS, amountWei],
    chain: i.walletClient.chain,
    account: i.address,
  });
  await requireConfirmedTx(i.arcClient, approvalTxHash, i.revertedText);
  const depositHash = await i.walletClient.writeContract({
    address: KARWAN_VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: 'deposit',
    args: [amountWei],
    chain: i.walletClient.chain,
    account: i.address,
  });
  await requireConfirmedTx(i.arcClient, depositHash, i.revertedText);
  const completed = await api.vaultDepositComplete({
    address: i.address,
    amountUsdc: i.amountUsdc,
    requestId,
    approvalTxHash,
    depositTxHash: depositHash,
  });
  return { txHash: depositHash, reference: completed.reference };
}
