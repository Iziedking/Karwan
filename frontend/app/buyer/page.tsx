'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type BuyerJob } from '@/core/api';
import { useActivation } from '@/shared/hooks/useActivation';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { BusinessTradeDesk } from '@/features/buyer/components/BusinessTradeDesk';
import { JobsTable } from '@/features/buyer/components/JobsTable';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { NewDealPanel } from '@/features/deals/components/NewDealPanel';
import { MarketScout } from '@/features/research/components/MarketScout';
import { SCOUT_ENABLED } from '@/features/profile/config';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ActivateAgentsNotice } from '@/shared/components/ActivateAgentsNotice';
import {
  FullBleed,
  Band,
  SectionTag,
  HeroHeadline,
  Punc,
  PageCard,
} from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { TRADE_ENTRY_COPY } from '@/features/home/tradeEntry';

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
  const { isBusinessWorkspace } = useWorkspaceContext();
  return isBusinessWorkspace ? <BusinessTradeDesk /> : <PersonalBuyerDesk />;
}

function PersonalBuyerDesk() {
  const { locale } = useLocale();
  const entry = TRADE_ENTRY_COPY[locale];
  const creation = useTranslations().dealCreation;
  const auth = useAuth();
  const address = auth.address;
  const { agents, activated } = useActivation();
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

  return (
    <FullBleed>
      <Band tone="light" compact>
        <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.04em] text-[var(--lp-dark)]">{creation.title}</h1>
        <p className="mt-3 max-w-[54ch] text-[15px] leading-6 text-[var(--lp-text-sub)]">{creation.intro}</p>
      </Band>

      {/* ACTIVATE NOTICE. shared band, renders nothing once activated. Catches
          the dead end where a profile is saved but no agent was provisioned. */}
      <ActivateAgentsNotice role="buyer" tone="light" />

      {/* NEW DEAL + SIDE COLUMN */}
      <Band tone="light" compact>
        <div id="new-deal" className="scroll-mt-20" />
        <div className="mx-auto max-w-[860px] space-y-5">
          <div className="min-w-0">
            <PageCard>
              <div className="p-6 md:p-8">
                <NewDealPanel />
              </div>
            </PageCard>
          </div>
          <details className="rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
            <summary className="flex min-h-11 cursor-pointer items-center px-5 py-3 text-[14px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">{entry.tools}<span aria-hidden className="ms-auto">⌄</span></summary>
            <div className="space-y-4 px-5 pb-5">
              <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} />
              {SCOUT_ENABLED && <MarketScout />}
            </div>
          </details>
        </div>
      </Band>

      {/* MANAGED DEALS */}
      <Band tone="dark" compact>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[46ch]">
            <div className="flex items-center gap-2">
              <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
                {bh.managedDeals.sectionTag}
              </SectionTag>
              <Hint glow side="bottom" align="start">{bh.managedDeals.description}</Hint>
            </div>
            <HeroHeadline as="h2" size="md">
              {bh.managedDeals.headline}
              {sortedJobs.length > 0 && (
                <>
                  <Punc>.</Punc>
                  <span className="ms-3 text-[var(--lp-workspace-muted)] font-sans font-extrabold">
                    {sortedJobs.length}
                  </span>
                </>
              )}
              {sortedJobs.length === 0 && <Punc>.</Punc>}
            </HeroHeadline>
          </div>
        </div>
        <div className="mt-10">
          <div
            className="overflow-hidden"
            style={{
              background: 'var(--lp-workspace-raised)',
              border: '1px solid var(--lp-workspace-border)',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderBottomLeftRadius: 22,
              borderBottomRightRadius: 5,
            }}
          >
            {fetchState === 'error' ? (
              <p className="p-8 text-center text-[13px] text-[#ff8a7a]">
                {bh.managedDeals.statesError}
              </p>
            ) : fetchState === 'loading' || fetchState === 'idle' ? (
              <div className="p-8 space-y-3">
                <div className="h-14 rounded-md bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
                <div className="h-14 rounded-md bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
              </div>
            ) : sortedJobs.length === 0 ? (
              <p className="p-8 text-center text-[13px] text-[var(--lp-workspace-muted)]">
                {bh.managedDeals.statesEmpty}
              </p>
            ) : (
              <JobsTable jobs={sortedJobs} />
            )}
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}
