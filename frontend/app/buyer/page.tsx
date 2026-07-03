'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type BuyerJob } from '@/core/api';
import { useActivation } from '@/shared/hooks/useActivation';
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
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  AddressPill,
  PageCard,
} from '@/shared/components/Bands';
import { shortAddress } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

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
      {/* HERO. compact title row so the new-deal form sits near the fold. */}
      <Band tone="dark" compact overlay={<GridOverlay />}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
          <div className="min-w-0">
            <div className="fade-up">
              <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
                {bh.hero.sectionTag}
              </SectionTag>
            </div>
            <div className="fade-up fade-up-1">
              <HeroHeadline size="sm">
                {bh.hero.headlineLine1}
                <Punc>.</Punc>
                <br />
                {bh.hero.headlineLine2Prefix} <Accent>{bh.hero.headlineLine2Accent}</Accent>.
              </HeroHeadline>
            </div>
            <p className="fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[44ch]">
              {bh.hero.description}
            </p>
            <div className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#new-deal"
                className="group inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_0_rgba(0,0,0,0.22)] hover:shadow-[0_5px_0_rgba(0,0,0,0.22)] active:shadow-[0_1px_0_rgba(0,0,0,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-dark)]"
                style={{
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  borderBottomLeftRadius: 14,
                  borderBottomRightRadius: 4,
                }}
              >
                {bh.hero.openDealCta}
              </a>
              {address && (
                <span className="ms-1">
                  <AddressPill address={shortAddress(address)} tone="dark" />
                </span>
              )}
            </div>
          </div>
          <div className="hidden lg:block fade-up fade-up-4">
            <AgentStatusVignette
              activated={activated}
              jobsCount={sortedJobs.length}
              copy={bh.agentVignette}
            />
          </div>
        </div>
      </Band>

      {/* ACTIVATE NOTICE. shared band, renders nothing once activated. Catches
          the dead end where a profile is saved but no agent was provisioned. */}
      <ActivateAgentsNotice role="buyer" tone="light" />

      {/* NEW DEAL + SIDE COLUMN */}
      <Band tone="light" compact>
        <div id="new-deal" className="scroll-mt-20" />
        <SectionTag>{bh.newDeal.sectionTag}</SectionTag>
        <HeroHeadline size="md">
          {bh.newDeal.headline}
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          {bh.newDeal.description}
        </p>
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="min-w-0 lg:col-span-2">
            <PageCard>
              <div className="p-6 md:p-8">
                <NewDealPanel />
              </div>
            </PageCard>
          </div>
          <div className="space-y-4">
            <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} />
            {SCOUT_ENABLED && <MarketScout />}
          </div>
        </div>
      </Band>

      {/* MANAGED DEALS */}
      <Band tone="dark" compact>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[46ch]">
            <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
              {bh.managedDeals.sectionTag}
            </SectionTag>
            <HeroHeadline size="md">
              {bh.managedDeals.headline}
              {sortedJobs.length > 0 && (
                <>
                  <Punc>.</Punc>
                  <span className="ms-3 text-white/55 font-sans font-extrabold">
                    {sortedJobs.length}
                  </span>
                </>
              )}
              {sortedJobs.length === 0 && <Punc>.</Punc>}
            </HeroHeadline>
            <p className="mt-5 text-pretty text-[14px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
              {bh.managedDeals.description}
            </p>
          </div>
        </div>
        <div className="mt-10">
          <div
            className="overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
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
                <div className="h-14 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
                <div className="h-14 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
              </div>
            ) : sortedJobs.length === 0 ? (
              <p className="p-8 text-center text-[13px] text-white/55">
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

function AgentStatusVignette({
  activated,
  jobsCount,
  copy,
}: {
  activated: boolean;
  jobsCount: number;
  copy: Messages['buyerHub']['agentVignette'];
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 4,
      }}
    >
      <div className="px-6 pt-6 pb-5 border-b border-white/[0.08]">
        <div className="flex items-center justify-between">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
            {copy.eyebrow}
          </span>
          {activated ? (
            <span
              aria-hidden
              data-instrument-blink
              className="w-[7px] h-[7px]"
              style={{
                background: 'var(--lp-accent)',
                animation: 'instrumentBlink 1.6s ease-in-out infinite',
              }}
            />
          ) : (
            <span
              aria-hidden
              className="w-[7px] h-[7px] rounded-full bg-white/30"
            />
          )}
        </div>
        <p className="mt-4 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] text-white">
          {copy.titlePrefix}{' '}
          <span style={{ color: activated ? 'var(--lp-accent)' : 'rgba(255,255,255,0.5)' }}>
            {activated ? copy.statusActive : copy.statusIdle}
          </span>
        </p>
        <p className="mt-1.5 text-[12px] text-white/55 leading-relaxed">
          {activated ? copy.bodyActive : copy.bodyIdle}
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/[0.08]">
        <div className="px-4 py-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">
            {copy.runningLabel}
          </p>
          <p className="mt-1.5 font-sans text-[24px] font-extrabold tabular-nums tracking-[-0.02em]">
            {jobsCount}
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">
            {copy.roundCapLabel}
          </p>
          <p className="mt-1.5 font-sans text-[24px] font-extrabold tabular-nums tracking-[-0.02em]">
            1
          </p>
          <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.1em] text-white/45">
            {copy.counterLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
