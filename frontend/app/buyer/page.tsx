'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type BuyerJob } from '@/core/api';
import { useActivation } from '@/shared/hooks/useActivation';
import { JobsTable } from '@/features/buyer/components/JobsTable';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import { NewDealPanel } from '@/features/deals/components/NewDealPanel';
import { DirectDealList } from '@/features/deals/components/DirectDealList';
import { SignInGate } from '@/shared/components/SignInGate';
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

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export default function BuyerPage() {
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
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

  if (!isConnected) {
    return (
      <SignInGate
        variant="page"
        tag="BUYER DESK"
        body="Briefs and direct deals are keyed to your wallet. Sign in to continue."
      />
    );
  }

  return (
    <FullBleed>
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="grid lg:grid-cols-[1.3fr_1fr] gap-12 items-center">
          <div className="min-w-0">
            <div className="fade-up">
              <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
                BUYER DESK
              </SectionTag>
            </div>
            <div className="fade-up fade-up-1">
              <HeroHeadline>
                Run the auction
                <Punc>.</Punc>
                <br />
                Or name your <Accent>counterparty</Accent>.
              </HeroHeadline>
            </div>
            <p className="fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[44ch]">
              Run an auction from a brief, or open a direct deal with a known counterparty.
            </p>
            <div className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#new-deal"
                className="group inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_0_rgba(0,0,0,0.22)] hover:shadow-[0_5px_0_rgba(0,0,0,0.22)] active:shadow-[0_1px_0_rgba(0,0,0,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-dark)]"
                style={{
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  borderBottomLeftRadius: 14,
                  borderBottomRightRadius: 4,
                }}
              >
                Open a deal ↓
              </a>
              {address && (
                <span className="ml-1">
                  <AddressPill address={shortAddress(address)} tone="dark" />
                </span>
              )}
            </div>
          </div>
          <div className="hidden lg:block fade-up fade-up-4">
            <AgentStatusVignette activated={activated} jobsCount={sortedJobs.length} />
          </div>
        </div>
      </Band>

      {/* NEW DEAL + SIDE COLUMN */}
      <Band tone="light" compact>
        <div id="new-deal" className="scroll-mt-20" />
        <SectionTag>NEW DEAL</SectionTag>
        <HeroHeadline size="md">
          Open a deal<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          One transaction to escrow.
        </p>
        <div className="mt-10 grid lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2">
            <PageCard>
              <div className="p-6 md:p-8">
                <NewDealPanel />
              </div>
            </PageCard>
          </div>
          <div className="space-y-4" id="bridge-section">
            <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} />
            <BridgeCard mintRecipient={agents?.buyer as `0x${string}` | undefined} />
          </div>
        </div>
      </Band>

      {/* DIRECT DEALS */}
      <Band tone="light" compact>
        <SectionTag>DIRECT DEALS</SectionTag>
        <HeroHeadline size="md">
          Deals you <Accent>opened</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          Direct deals with you as the buyer.
        </p>
        <div className="mt-10">
          <PageCard>
            <DirectDealList role="buyer" />
          </PageCard>
        </div>
      </Band>

      {/* MANAGED DEALS */}
      <Band tone="dark" compact>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[46ch]">
            <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
              MANAGED DEALS
            </SectionTag>
            <HeroHeadline size="md">
              Running auctions
              {sortedJobs.length > 0 && (
                <>
                  <Punc>.</Punc>
                  <span className="ml-3 text-white/55 font-sans font-extrabold">
                    {sortedJobs.length}
                  </span>
                </>
              )}
              {sortedJobs.length === 0 && <Punc>.</Punc>}
            </HeroHeadline>
            <p className="mt-5 text-pretty text-[14px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
              Live auctions. Bids scored, one counter per round, escrow funded on accept.
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
            {!isConnected ? (
              <p className="p-8 text-center text-[13px] text-white/55">
                Connect your wallet to see managed deals.
              </p>
            ) : fetchState === 'error' ? (
              <p className="p-8 text-center text-[13px] text-[#ff8a7a]">
                Couldn&apos;t load your managed deals.
              </p>
            ) : fetchState === 'loading' || fetchState === 'idle' ? (
              <div className="p-8 space-y-3">
                <div className="h-14 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
                <div className="h-14 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
              </div>
            ) : sortedJobs.length === 0 ? (
              <p className="p-8 text-center text-[13px] text-white/55">
                No managed deals yet. Post a brief to start one.
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
}: {
  activated: boolean;
  jobsCount: number;
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
            Agent control
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
          Buyer agent{' '}
          <span style={{ color: activated ? 'var(--lp-accent)' : 'rgba(255,255,255,0.5)' }}>
            {activated ? 'active' : 'idle'}
          </span>
        </p>
        <p className="mt-1.5 text-[12px] text-white/55 leading-relaxed">
          {activated
            ? 'Scoring bids. One counter per round. Funding on accept.'
            : 'Activate on profile to start running auctions.'}
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/[0.08]">
        <div className="px-4 py-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">Running</p>
          <p className="mt-1.5 font-sans text-[24px] font-extrabold tabular-nums tracking-[-0.02em]">
            {jobsCount}
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">Round cap</p>
          <p className="mt-1.5 font-sans text-[24px] font-extrabold tabular-nums tracking-[-0.02em]">
            1
          </p>
          <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.1em] text-white/45">
            counter
          </p>
        </div>
      </div>
    </div>
  );
}
