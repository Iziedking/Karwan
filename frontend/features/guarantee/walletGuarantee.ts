import { encodeFunctionData, erc20Abi, parseAbi } from 'viem';
import { api, type GuaranteeStep } from '@/core/api';
import { requireConfirmedTx } from '@/shared/chain/confirmTx';
import type { OwnCall } from '@/shared/chain/ownWalletPlan';
import type { OwnWallet } from '@/shared/chain/useOwnWalletSend';

const vaultAbi = parseAbi([
  'function stake(address asset, uint256 amount)',
  'function requestWithdraw(address asset, uint256 amount)',
  'function cancelWithdraw(address asset)',
  'function withdraw(address asset)',
]);

/// One Deal guarantee step signed by the person's own wallet (view 37): the
/// server records the step first, the wallet signs once, the chain confirms,
/// then the server proves it from the receipt. A guarantee belongs to an
/// identity, so the stake call is marked as needing the record: a person's
/// first put up registers them first, in the same transaction.
export async function runWalletGuarantee(i: {
  step: GuaranteeStep;
  amountUsdc?: string;
  ownWallet: OwnWallet;
  arcClient: Parameters<typeof requireConfirmedTx>[0];
  revertedText: string;
}): Promise<{ txHash: `0x${string}`; recordSetUp: boolean }> {
  const requestId = crypto.randomUUID();
  const intent = await api.guaranteeIntent({ step: i.step, ...(i.amountUsdc ? { amountUsdc: i.amountUsdc } : {}), requestId });
  const amount = BigInt(intent.amountMicros);
  const call = (data: `0x${string}`, needsRecord = false): OwnCall => ({ to: intent.vault, data, ...(needsRecord ? { needsRecord } : {}) });
  const calls: OwnCall[] =
    i.step === 'put_up'
      ? [
          { to: intent.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [intent.vault, amount] }) },
          call(encodeFunctionData({ abi: vaultAbi, functionName: 'stake', args: [intent.usdc, amount] }), true),
        ]
      : i.step === 'take_out'
        ? [call(encodeFunctionData({ abi: vaultAbi, functionName: 'requestWithdraw', args: [intent.usdc, amount] }))]
        : i.step === 'cancel'
          ? [call(encodeFunctionData({ abi: vaultAbi, functionName: 'cancelWithdraw', args: [intent.usdc] }))]
          : [call(encodeFunctionData({ abi: vaultAbi, functionName: 'withdraw', args: [intent.usdc] }))];
  const sent = await i.ownWallet.send(calls, i.step === 'put_up' ? { spendsMicros: amount } : {});
  await requireConfirmedTx(i.arcClient, sent.txHash, i.revertedText);
  await api.guaranteeComplete({ step: i.step, ...(i.amountUsdc ? { amountUsdc: i.amountUsdc } : {}), requestId, txHash: sent.txHash });
  return { txHash: sent.txHash, recordSetUp: await i.ownWallet.recordDone(sent) };
}

/// A step on an older contract from the person's own wallet: the server
/// returns the calls only after simulating them from this wallet.
export async function runWalletLegacyCalls(i: {
  calls: Array<{ to: `0x${string}`; data: `0x${string}` }>;
  ownWallet: OwnWallet;
  arcClient: Parameters<typeof requireConfirmedTx>[0];
  revertedText: string;
}): Promise<{ txHash: `0x${string}`; recordSetUp: boolean }> {
  const sent = await i.ownWallet.send(i.calls);
  await requireConfirmedTx(i.arcClient, sent.txHash, i.revertedText);
  return { txHash: sent.txHash, recordSetUp: await i.ownWallet.recordDone(sent) };
}
