'use client';
import { useCallback, useMemo } from 'react';
import { encodeFunctionData, erc20Abi } from 'viem';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { api } from '@/core/api';
import { ARC_CHAIN_ID, ARC_USDC_ADDRESS } from '@/features/profile/config';
import { confirmTransaction } from './confirmTx';
import { MULTICALL3FROM, multicall3FromAbi } from './multicall3From';
import { orderCalls, recordFits, type Call3, type OwnCall, type RecordStep } from './ownWalletPlan';

type Hex = `0x${string}`;

export type OwnWalletSent = { txHash: Hex; withRecord: boolean };
export type OwnWallet = ReturnType<typeof useOwnWalletSend>;

const RECORD_ALONE_REFUSED = {
  later: 'This could not be sent right now. Try again in a moment.',
  fee: 'Add a little USDC on Arc for the network fee, then try again.',
  contractWallet: 'This wallet cannot sign this step. Use an ordinary wallet such as MetaMask.',
} as const;

/// Native USDC on Arc has 18 decimals; the ERC-20 view has 6.
const WEI_PER_MICRO = 1_000_000_000_000n;

const batchData = (calls: Call3[]) => encodeFunctionData({ abi: multicall3FromAbi, functionName: 'aggregate3', args: [calls] });

/// Every Arc transaction a person signs from their own wallet goes through here,
/// so the steps still missing from their Karwan record ride along when the
/// balance allows (view 27, decision 10). `send` returns once the wallet has
/// signed; the caller waits for the chain as it did before, then asks
/// `recordDone` whether to say the record is set up.
export function useOwnWalletSend() {
  const { address, connector } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const arc = usePublicClient({ chainId: ARC_CHAIN_ID });
  const { openConnectModal } = useConnectModal();

  const send = useCallback(
    async (calls: OwnCall[], opts: { spendsMicros?: bigint; spendsWholeBalance?: boolean } = {}): Promise<OwnWalletSent> => {
      if (!address || !connector) {
        openConnectModal?.();
        throw new Error('Connect your wallet, then confirm again.');
      }
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID });
      if (!walletClient || !arc) throw new Error('Wallet client unavailable');
      const sendTo = (to: Hex, data: Hex) => walletClient.sendTransaction({ to, data, chain: walletClient.chain, account: address });
      // With nothing of their own to send, the record alone could not go; say why.
      const alone = async (why: keyof typeof RECORD_ALONE_REFUSED = 'later'): Promise<OwnWalletSent> => {
        if (calls.length === 0) throw new Error(RECORD_ALONE_REFUSED[why]);
        const txHash = calls.length === 1 ? await sendTo(calls[0]!.to, calls[0]!.data) : await sendTo(MULTICALL3FROM, batchData(orderCalls(calls, [])));
        return { txHash, withRecord: false };
      };

      // A record step is never worth stopping the person's own transaction for.
      const record = await missingRecord().catch(() => null);
      const steps = record?.steps ?? [];
      if (steps.length === 0) return alone();
      if (!(await sendsFromAnOrdinaryWallet(arc, address))) return alone('contractWallet');

      const withRecord = orderCalls(calls, steps);
      try {
        const balance = await arc.readContract({ address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] });
        const { maxFeePerGas } = await arc.estimateFeesPerGas();
        const gasWith = await arc.estimateGas({ account: address, to: MULTICALL3FROM, data: batchData(withRecord) });
        const gasAlone = calls.length === 0 ? 0n : await arc.estimateGas({ account: address, to: MULTICALL3FROM, data: batchData(orderCalls(calls, [])) });
        const micros = (gas: bigint) => (gas * (maxFeePerGas ?? 0n) + WEI_PER_MICRO - 1n) / WEI_PER_MICRO;
        const fits = recordFits({
          steps,
          spendsWholeBalance: opts.spendsWholeBalance ?? false,
          balanceAfterMicros: balance - (opts.spendsMicros ?? 0n) - micros(gasAlone),
          extraFeeMicros: micros(gasWith - gasAlone),
          validUntil: record!.validUntil,
          nowSecs: Math.floor(Date.now() / 1000),
        });
        if (!fits) return alone('fee');
        // A batch that would fail with the record but not without goes alone.
        await arc.call({ account: address, to: MULTICALL3FROM, data: batchData(withRecord) });
      } catch {
        return alone();
      }
      return { txHash: await sendTo(MULTICALL3FROM, batchData(withRecord)), withRecord: true };
    },
    [address, connector, openConnectModal, chainId, switchChainAsync, walletClient, arc],
  );

  /// True once the chain shows this transaction completed the record.
  const recordDone = useCallback(
    async (sent: OwnWalletSent): Promise<boolean> => {
      if (!sent.withRecord || !arc) return false;
      const outcome = await confirmTransaction(arc, sent.txHash).catch(() => null);
      if (outcome?.state !== 'success') return false;
      const status = await api.recordSetupStatus().catch(() => null);
      return status?.complete === true;
    },
    [arc],
  );

  return useMemo(() => ({ send, recordDone }), [send, recordDone]);
}

async function missingRecord(): Promise<{ steps: RecordStep[]; validUntil: number } | null> {
  const status = await api.recordSetupStatus();
  if (!status.available || status.complete) return null;
  return { steps: status.steps ?? [], validUntil: status.validUntil ?? 0 };
}

/// Arc's batcher takes a transaction only from an ordinary wallet. A wallet
/// that delegates to code (EIP-7702) still signs as one; a contract wallet does not.
async function sendsFromAnOrdinaryWallet(arc: NonNullable<ReturnType<typeof usePublicClient>>, address: Hex): Promise<boolean> {
  const code = (await arc.getCode({ address }).catch(() => undefined)) ?? '0x';
  return code === '0x' || code.toLowerCase().startsWith('0xef0100');
}
