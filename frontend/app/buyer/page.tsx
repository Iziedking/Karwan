'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type BuyerJob } from '@/core/api';
import { JobsTable } from '@/features/buyer/components/JobsTable';
import { openRequestCount } from '@/features/buyer/requestCounts';
import { NewDealPanel } from '@/features/deals/components/NewDealPanel';
import { DealAmountProvider } from '@/features/balances/dealAmount';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { FullBleed, Band, PageCard } from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useSearchV2 } from '@/features/search/useSearchV2';
import { DirectDealOnly, FindSellerPage } from '@/features/search/components/FindSellerPage';

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export default function BuyerPage() {
  const bh = useTranslations().buyerHub;
  return (
    <AuthGuard gateTag={bh.signInGate.tag} gateBody={bh.signInGate.body}>
      <BuyerPageInner />
    </AuthGuard>
  );
}

function BuyerPageInner() {
  const v2 = useSearchV2();
  const search = useSearchParams();
  if (!v2) return <PersonalBuyerDesk />;
  const direct = search.get('mode') === 'direct' || !!search.get('seller') || !!search.get('sellerEmail');
  return direct ? <DirectDealOnly /> : <FindSellerPage />;
}

function PersonalBuyerDesk() {
  const creation = useTranslations().dealCreation;
  const auth = useAuth();
  const address = auth.address;
  const [jobs, setJobs] = useState<BuyerJob[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const bh = useTranslations().buyerHub;

  useEffect(() => {
    if (!address) {
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
  }, [address]);

  const sortedJobs = [...jobs].sort((a, b) => b.deadlineUnix - a.deadlineUnix);
  const openCount = openRequestCount(jobs);

  return (
    <FullBleed>
      <Band tone="light" compact>
        <h1 className="flex items-center gap-2 text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.04em] text-[var(--lp-dark)]">{creation.title}<Hint side="bottom">{creation.intro}</Hint></h1>
      </Band>

      {/* ACTIVATE NOTICE. shared band, renders nothing once activated. Catches
          the dead end where a profile is saved but no agent was provisioned. */}

      {/* NEW DEAL + SIDE COLUMN */}
      <Band tone="light" compact>
        <div id="new-deal" className="scroll-mt-20" />
        <DealAmountProvider>
        <div className="mx-auto grid max-w-[640px] items-start gap-5">
          <div className="min-w-0">
            <PageCard>
              <div className="p-6 md:p-8">
                <NewDealPanel />
              </div>
            </PageCard>
          </div>
        </div>
        </DealAmountProvider>
      </Band>

      {/* YOUR REQUESTS */}
      <Band tone="light" compact>
        <div className="mx-auto max-w-[940px]">
          <div className="flex items-baseline justify-between gap-4 border-b border-[var(--lp-border-light)] pb-4">
            <h2 className="flex items-center gap-2 text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-[var(--lp-dark)]">
              {bh.managedDeals.headline}
              <Hint side="bottom" align="start">{bh.managedDeals.description}</Hint>
            </h2>
            {fetchState === 'ready' && openCount > 0 && (
              <p className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--lp-text-sub)]">
                {bh.managedDeals.openCount.replace('{count}', String(openCount))}
              </p>
            )}
          </div>
          {fetchState === 'error' ? (
            <p role="alert" className="py-10 text-center text-[15px] font-medium text-[var(--color-critical)]">
              {bh.managedDeals.statesError}
            </p>
          ) : fetchState === 'loading' || fetchState === 'idle' ? (
            <div className="space-y-3 py-6" aria-busy>
              <div className="h-14 rounded-md bg-[var(--color-surface-2)] motion-safe:animate-pulse" />
              <div className="h-14 rounded-md bg-[var(--color-surface-2)] motion-safe:animate-pulse" />
            </div>
          ) : sortedJobs.length === 0 ? (
            <p className="py-10 text-center text-[15px] font-medium text-[var(--lp-text-sub)]">
              {bh.managedDeals.statesEmpty}
            </p>
          ) : (
            <JobsTable jobs={sortedJobs} />
          )}
        </div>
      </Band>
    </FullBleed>
  );
}
