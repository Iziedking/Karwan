'use client';
import { useCallback } from 'react';
import { formatUnits } from 'viem';
import { useBalance } from 'wagmi';
import { arcChain } from '@/core/wagmi';
import { useAuth } from '@/shared/hooks/useAuth';
import { useActivation } from '@/shared/hooks/useActivation';
import { useGatewayBalance } from '@/features/gateway/useGatewayBalance';

const POLL_MS = 30_000;

function amountOf(data: { value: bigint; decimals: number } | undefined): number | null {
  return data ? Number(formatUnits(data.value, data.decimals)) : null;
}

/// The money home's numbers, read the way BalancesCard reads them: the Arc
/// balance of the sign-in wallet and of each agent, straight from the chain,
/// plus the Gateway balance the account already holds. SSE invalidation and
/// useMoneyRefresh move them when money moves; the poll is the safety net.
export function useMoneyBalances() {
  const auth = useAuth();
  const { agents, activated, loading: activationLoading } = useActivation();
  const address = (auth.address ?? undefined) as `0x${string}` | undefined;
  const buyerAddress = (agents?.buyer ?? undefined) as `0x${string}` | undefined;
  const sellerAddress = (agents?.seller ?? undefined) as `0x${string}` | undefined;
  const identity = useBalance({ address, chainId: arcChain.id, query: { enabled: !!address, refetchInterval: POLL_MS } });
  const buyer = useBalance({ address: buyerAddress, chainId: arcChain.id, query: { enabled: !!buyerAddress, refetchInterval: POLL_MS } });
  const seller = useBalance({ address: sellerAddress, chainId: arcChain.id, query: { enabled: !!sellerAddress, refetchInterval: POLL_MS } });
  const gateway = useGatewayBalance();

  const refetchIdentity = identity.refetch;
  const refetchBuyer = buyer.refetch;
  const refetchSeller = seller.refetch;
  const refreshGateway = gateway.refresh;
  const refetch = useCallback(() => {
    void refetchIdentity();
    void refetchBuyer();
    void refetchSeller();
    void refreshGateway();
  }, [refetchIdentity, refetchBuyer, refetchSeller, refreshGateway]);

  return {
    balance: amountOf(identity.data),
    pool: gateway.confirmed,
    buyer: amountOf(buyer.data),
    seller: amountOf(seller.data),
    agents,
    activated,
    activationLoading,
    loading: !!address && identity.isPending,
    error: identity.isError,
    refetch,
  };
}
