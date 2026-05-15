'use client';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { api, type BuyerJob } from '@/core/api';
import { useActivation } from '@/shared/hooks/useActivation';
import { JobsTable } from '@/features/buyer/components/JobsTable';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import { NewDealPanel } from '@/features/deals/components/NewDealPanel';
import { DirectDealList } from '@/features/deals/components/DirectDealList';
import {
  AppCanvas,
  Section,
  GridOverlay,
  EyebrowChip,
  AddressChip,
  Skeleton,
} from '@/shared/components/AppUI';

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export default function BuyerPage() {
  const { address, isConnected } = useAccount();
  const { agents, activated } = useActivation();
  const [jobs, setJobs] = useState<BuyerJob[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');

  useEffect(() => {
    if (!isConnected || !address) {
      setJobs([]);
      setFetchState('idle');
      return;
    }
    let cancelled = false;
    setFetchState('loading');
    api
      .buyer(address)
      .then((d) => {
        if (cancelled) return;
        setJobs(d.jobs);
        setFetchState('ready');
      })
      .catch(() => {
        if (!cancelled) setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  const sortedJobs = [...jobs].sort((a, b) => b.deadlineUnix - a.deadlineUnix);

  return (
    <AppCanvas>
      {/* HEADER */}
      <Section tone="dark" className="relative overflow-hidden">
        <GridOverlay />
        <div className="relative">
          <EyebrowChip dot={activated ? 'live' : 'warning'} tone="dark">
            {activated ? 'Buyer agent active' : 'Buyer agent not set up'}
          </EyebrowChip>
          <h1 className="mt-4 font-sans font-bold tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
            Buyer
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--lp-text-muted)] max-w-md">
            Post a brief and your buyer agent runs the auction, or open a direct deal naming a
            counterparty you already have.
          </p>
          {address && (
            <div className="mt-4">
              <AddressChip address={address} tone="dark" />
            </div>
          )}
        </div>
      </Section>

      {/* NEW DEAL + SIDE COLUMN */}
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <Section className="lg:col-span-2">
          <EyebrowChip>New deal</EyebrowChip>
          <h2 className="mt-3 mb-6 font-sans font-bold tracking-[-0.02em] text-[clamp(1.4rem,2.2vw,1.9rem)]">
            Open a deal
          </h2>
          <NewDealPanel />
        </Section>
        <div className="space-y-4" id="bridge-section">
          <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} />
          <BridgeCard mintRecipient={agents?.buyer as `0x${string}` | undefined} />
        </div>
      </div>

      {/* DIRECT DEALS */}
      <Section className="p-0 overflow-hidden">
        <div className="px-7 md:px-10 pt-7 md:pt-9">
          <EyebrowChip>Direct deals</EyebrowChip>
          <h2 className="mt-3 font-sans font-bold tracking-[-0.02em] text-[clamp(1.4rem,2.2vw,1.9rem)]">
            Deals you opened
          </h2>
        </div>
        <div className="mt-5">
          <DirectDealList role="buyer" />
        </div>
      </Section>

      {/* MANAGED DEALS */}
      <Section className="p-0 overflow-hidden">
        <div className="px-7 md:px-10 pt-7 md:pt-9">
          <EyebrowChip>Managed deals</EyebrowChip>
          <h2 className="mt-3 font-sans font-bold tracking-[-0.02em] text-[clamp(1.4rem,2.2vw,1.9rem)]">
            Your buyer agent{sortedJobs.length > 0 ? ` · ${sortedJobs.length}` : ''}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
            Auctions your buyer agent is running for you.
          </p>
        </div>
        <div className="mt-5">
          {!isConnected ? (
            <p className="px-7 md:px-10 pb-8 text-[13px] text-[var(--lp-text-sub)]">
              Connect your wallet to see the managed deals your buyer agent is running.
            </p>
          ) : fetchState === 'error' ? (
            <p className="px-7 md:px-10 pb-8 text-[13px] text-[var(--lp-text-sub)]">
              Couldn&apos;t load your managed deals.
            </p>
          ) : fetchState === 'loading' || fetchState === 'idle' ? (
            <div className="px-7 md:px-10 pb-8 space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <JobsTable jobs={sortedJobs} />
          )}
        </div>
      </Section>
    </AppCanvas>
  );
}
