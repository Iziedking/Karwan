'use client';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { api, type BuyerJob } from '@/core/api';
import { useActivation } from '@/shared/hooks/useActivation';
import { Card } from '@/shared/components/Card';
import { JobsTable } from '@/features/buyer/components/JobsTable';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import { NewDealPanel } from '@/features/deals/components/NewDealPanel';
import { DirectDealList } from '@/features/deals/components/DirectDealList';
import { UserIdentityLine } from '@/shared/components/UserIdentityLine';

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export default function BuyerPage() {
  const { address, isConnected } = useAccount();
  const { agents } = useActivation();
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
        if (cancelled) return;
        setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  const sortedJobs = [...jobs].sort((a, b) => b.deadlineUnix - a.deadlineUnix);

  return (
    <div className="space-y-8">
      <header className="fade-up pb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] tracking-tight font-semibold">Buyer</h1>
          <UserIdentityLine />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-positive-soft)] text-[var(--color-positive)] text-[12px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" />
          Your buyer agent
        </div>
      </header>

      <div className="fade-up fade-up-1 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Card title="New deal">
            <NewDealPanel />
          </Card>
        </div>
        <div className="space-y-4" id="bridge-section">
          <BalancesCard />
          <BridgeCard mintRecipient={agents?.buyer as `0x${string}` | undefined} />
        </div>
      </div>

      <div className="fade-up fade-up-2">
        <Card title="Direct deals" noPadding>
          <DirectDealList role="buyer" />
        </Card>
      </div>

      <div className="fade-up fade-up-3">
        <Card
          title={`Managed deals${sortedJobs.length > 0 ? ` · ${sortedJobs.length}` : ''}`}
          noPadding
        >
          {!isConnected ? (
            <p className="px-5 py-8 text-[13px] text-[var(--color-ink-faint)]">
              Connect your wallet to see the managed deals your buyer agent is running.
            </p>
          ) : fetchState === 'error' ? (
            <p className="px-5 py-8 text-[13px] text-[var(--color-ink-faint)]">
              Couldn&apos;t load your managed deals.
            </p>
          ) : fetchState === 'loading' || fetchState === 'idle' ? (
            <p className="px-5 py-8 text-[13px] text-[var(--color-ink-faint)]">Loading…</p>
          ) : (
            <JobsTable jobs={sortedJobs} />
          )}
        </Card>
      </div>
    </div>
  );
}
