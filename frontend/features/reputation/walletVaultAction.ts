import { encodeFunctionData, parseUnits, type WalletClient } from 'viem';
import { api } from '@/core/api';
import { requireConfirmedTx } from '@/shared/chain/confirmTx';
import type { OwnWallet } from '@/shared/chain/useOwnWalletSend';
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
  /// The person's own wallet; the step can carry their Karwan record (view 27, decision 10).
  ownWallet: OwnWallet;
  arcClient: Parameters<typeof requireConfirmedTx>[0];
  revertedText: string;
  /// Told the movement's reference as soon as it is recorded.
  onReference?: (reference: string) => void;
}): Promise<{ txHash: `0x${string}`; reference: string; recordSetUp: boolean }> {
  const requestId = crypto.randomUUID();
  const intent = await api.vaultActionIntent({ address: i.address, positionId: i.positionId, action: i.action, requestId });
  i.onReference?.(intent.reference);
  const sent = await i.ownWallet.send([
    { to: KARWAN_VAULT_ADDRESS, data: encodeFunctionData({ abi: vaultAbi, functionName: i.action, args: [BigInt(i.positionId)] }) },
  ]);
  const hash = sent.txHash;
  await requireConfirmedTx(i.arcClient, hash, i.revertedText);
  const completed = await api.vaultActionComplete({ address: i.address, positionId: i.positionId, action: i.action, requestId, txHash: hash });
  return { txHash: hash, reference: completed.reference, recordSetUp: await i.ownWallet.recordDone(sent) };
}

/// Putting money into deal insurance from the person's own wallet: the receipt
/// is recorded before either signature, then an exact approval and the
/// deposit, each waited on. The deal insurance page and the assistant's card
/// both run it.
export async function runWalletVaultDeposit(i: {
  address: `0x${string}`;
  amountUsdc: number;
  walletClient: WalletClient;
  /// The approval goes through the person's own wallet sender, so it can carry
  /// their Karwan record; the deposit stays its own transaction for its receipt.
  ownWallet: OwnWallet;
  arcClient: Parameters<typeof requireConfirmedTx>[0];
  revertedText: string;
  onReference?: (reference: string) => void;
}): Promise<{ txHash: `0x${string}`; reference: string; recordSetUp: boolean }> {
  const amountWei = parseUnits(i.amountUsdc.toString(), ARC_USDC_DECIMALS);
  const requestId = crypto.randomUUID();
  const intent = await api.vaultDepositIntent({ address: i.address, amountUsdc: i.amountUsdc, requestId });
  i.onReference?.(intent.reference);
  // A fresh exact allowance every time keeps the two-leg receipt provable even
  // when an older allowance exists.
  const approval = await i.ownWallet.send(
    [{ to: ARC_USDC_ADDRESS, data: encodeFunctionData({ abi: approveAbi, functionName: 'approve', args: [KARWAN_VAULT_ADDRESS, amountWei] }) }],
    { spendsMicros: amountWei },
  );
  const approvalTxHash = approval.txHash;
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
  return { txHash: depositHash, reference: completed.reference, recordSetUp: await i.ownWallet.recordDone(approval) };
}
