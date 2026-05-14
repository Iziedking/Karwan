'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { api, type SellerActiveBid } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { BidsTable } from '@/features/seller/components/BidsTable';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { DirectDealList } from '@/features/deals/components/DirectDealList';
import { UserIdentityLine } from '@/shared/components/UserIdentityLine';

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export default function SellerPage() {
  const { address, isConnected } = useAccount();
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
        if (cancelled) return;
        setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  return (
    <div className="space-y-8">
      <header className="fade-up pb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] tracking-tight font-semibold">Seller</h1>
          <UserIdentityLine />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-positive-soft)] text-[var(--color-positive)] text-[12px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" />
          Your seller agent
        </div>
      </header>

      <div className="fade-up fade-up-1">
        <Card title="What this agent does">
          <div className="grid md:grid-cols-3 gap-5 text-[13px] text-[var(--color-ink-dim)]">
            <div className="space-y-1">
              <p className="font-medium text-[var(--color-ink)]">1. Watches the chain</p>
              <p>Subscribes to <span className="mono">JobPosted</span> events from the JobBoard contract.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-[var(--color-ink)]">2. Scores the brief</p>
              <p>Reads the buyer's brief, checks it against your skills and accepted ranges, then asks an LLM whether to bid.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-[var(--color-ink)]">3. Bids and negotiates</p>
              <p>Submits a bid on chain. Responds to counter-offers within its accepted range.</p>
            </div>
          </div>
          <p className="mt-5 pt-4 border-t border-[var(--color-line)] text-[12px] text-[var(--color-ink-faint)]">
            Every activated user with a seller profile bids through their own seller agent. Set
            your skills and ranges on the{' '}
            <Link href="/profile" className="underline text-[var(--color-ink)]">profile page</Link>.
            To trigger a round, post a brief from the{' '}
            <Link href="/buyer" className="underline text-[var(--color-ink)]">buyer dashboard</Link>.
          </p>
        </Card>
      </div>

      <div className="fade-up fade-up-2">
        <Card title="Direct deals for you" noPadding>
          <DirectDealList role="seller" />
        </Card>
      </div>

      <div className="fade-up fade-up-3 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Card
            title={`Active bids${activeBids.length > 0 ? ` · ${activeBids.length}` : ''}`}
            noPadding
          >
            {!isConnected ? (
              <p className="px-5 py-8 text-[13px] text-[var(--color-ink-faint)]">
                Connect your wallet to see the bids your seller agent has placed.
              </p>
            ) : fetchState === 'error' ? (
              <p className="px-5 py-8 text-[13px] text-[var(--color-ink-faint)]">
                Couldn&apos;t load your bids.
              </p>
            ) : fetchState === 'loading' || fetchState === 'idle' ? (
              <p className="px-5 py-8 text-[13px] text-[var(--color-ink-faint)]">Loading…</p>
            ) : (
              <BidsTable bids={activeBids} />
            )}
          </Card>
        </div>
        <BalancesCard />
      </div>
    </div>
  );
}
