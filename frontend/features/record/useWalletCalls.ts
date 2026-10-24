'use client';
import { useCallback } from 'react';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { ARC_CHAIN_ID } from '@/features/profile/config';
import { confirmTransaction } from '@/shared/chain/confirmTx';
import type { SendWalletCalls } from './runRecordSetup';

/// Sends prepared Arc calls from the person's own wallet, one at a time, each
/// waited on before the next. Connecting is part of the action.
export function useWalletCalls(): SendWalletCalls {
  const { address, connector } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const arcPublicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const { openConnectModal } = useConnectModal();
  return useCallback(
    async (calls) => {
      if (!address || !connector) {
        openConnectModal?.();
        throw new Error('Connect your wallet, then confirm again.');
      }
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID });
      if (!walletClient || !arcPublicClient) throw new Error('Wallet client unavailable');
      for (const call of calls) {
        const txHash = await walletClient.sendTransaction({ to: call.to, data: call.data, chain: walletClient.chain, account: address });
        const outcome = await confirmTransaction(arcPublicClient, txHash);
        if (outcome.state === 'reverted') throw new Error('The network rejected this step. Nothing else was sent.');
        if (outcome.state === 'pending') throw new Error('Waiting for the network to confirm. Try again in a moment.');
      }
    },
    [address, connector, openConnectModal, chainId, switchChainAsync, walletClient, arcPublicClient],
  );
}
