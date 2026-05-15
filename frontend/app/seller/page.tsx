'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { api, type SellerActiveBid } from '@/core/api';
import { useActivation } from '@/shared/hooks/useActivation';
import { BidsTable } from '@/features/seller/components/BidsTable';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
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

const STEPS = [
  {
    n: '1. Watches the chain',
    body: 'Subscribes to JobPosted events from the JobBoard contract.',
  },
  {
    n: '2. Scores the brief',
    body: "Reads the buyer's brief, checks it against your skills and accepted ranges, then asks an LLM whether to bid.",
  },
  {
    n: '3. Bids and negotiates',
    body: 'Submits a bid on chain. Responds to counter-offers within its accepted range.',
  },
];

export default function SellerPage() {
  const { address, isConnected } = useAccount();
  const { activated, agents } = useActivation();
  const [activeBids, setActiveBids] = useState<SellerActiveBid[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');

  useEffect(() => {
    if (!isConnected || !address) {
      setActiveBids([]);
      setFetchState('idle');
      return;
    }
    let cancelled = false;
    setFetchState('loading');
    api
      .seller(address)
      .then((d) => {
        if (cancelled) return;
        setActiveBids(d.activeBids);
        setFetchState('ready');
      })
      .catch(() => {
        if (!cancelled) setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  return (
    <AppCanvas>
      {/* HEADER */}
      <Section tone="dark" className="relative overflow-hidden">
        <GridOverlay />
        <div className="relative">
          <EyebrowChip dot={activated ? 'live' : 'warning'} tone="dark">
            {activated ? 'Seller agent active' : 'Seller agent not set up'}
          </EyebrowChip>
          <h1 className="mt-4 font-sans font-bold tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
            Seller
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--lp-text-muted)] max-w-md">
            Your seller agent watches the chain and bids on briefs that match your skills, on your
            behalf.
          </p>
          {address && (
            <div className="mt-4">
              <AddressChip address={address} tone="dark" />
            </div>
          )}
        </div>
      </Section>

      {/* WHAT THIS AGENT DOES */}
      <Section>
        <EyebrowChip>How it works</EyebrowChip>
        <h2 className="mt-3 mb-6 font-sans font-bold tracking-[-0.02em] text-[clamp(1.4rem,2.2vw,1.9rem)]">
          What this agent does
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-[20px] bg-[var(--lp-light)] p-6">
              <h3 className="font-sans text-[15px] font-bold tracking-[-0.01em]">{s.n}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
          Every activated user with a seller profile bids through their own seller agent. Set your
          skills and ranges on the{' '}
          <Link href="/profile" className="font-semibold text-[var(--lp-dark)] underline underline-offset-2">
            profile page
          </Link>
          . To trigger a round, post a brief from the{' '}
          <Link href="/buyer" className="font-semibold text-[var(--lp-dark)] underline underline-offset-2">
            buyer dashboard
          </Link>
          .
        </p>
      </Section>

      {/* DIRECT DEALS FOR YOU */}
      <Section className="p-0 overflow-hidden">
        <div className="px-7 md:px-10 pt-7 md:pt-9">
          <EyebrowChip>Direct deals</EyebrowChip>
          <h2 className="mt-3 font-sans font-bold tracking-[-0.02em] text-[clamp(1.4rem,2.2vw,1.9rem)]">
            Direct deals for you
          </h2>
        </div>
        <div className="mt-5">
          <DirectDealList role="seller" />
        </div>
      </Section>

      {/* ACTIVE BIDS + BALANCE */}
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <Section className="lg:col-span-2 p-0 overflow-hidden">
          <div className="px-7 md:px-10 pt-7 md:pt-9">
            <EyebrowChip>Auctions</EyebrowChip>
            <h2 className="mt-3 font-sans font-bold tracking-[-0.02em] text-[clamp(1.4rem,2.2vw,1.9rem)]">
              Active bids{activeBids.length > 0 ? ` · ${activeBids.length}` : ''}
            </h2>
          </div>
          <div className="mt-5">
            {!isConnected ? (
              <p className="px-7 md:px-10 pb-8 text-[13px] text-[var(--lp-text-sub)]">
                Connect your wallet to see the bids your seller agent has placed.
              </p>
            ) : fetchState === 'error' ? (
              <p className="px-7 md:px-10 pb-8 text-[13px] text-[var(--lp-text-sub)]">
                Couldn&apos;t load your bids.
              </p>
            ) : fetchState === 'loading' || fetchState === 'idle' ? (
              <div className="px-7 md:px-10 pb-8 space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <BidsTable bids={activeBids} />
            )}
          </div>
        </Section>
        <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} />
      </div>
    </AppCanvas>
  );
}
