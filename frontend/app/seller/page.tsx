'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type SellerActiveBid } from '@/core/api';
import { PendingMatchesBand } from '@/features/notifications/components/PendingMatchesBand';
import { useActivation } from '@/shared/hooks/useActivation';
import { BidsTable } from '@/features/seller/components/BidsTable';
import { PostListingForm } from '@/features/seller/components/PostListingForm';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
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

const STEPS = [
  {
    n: '01',
    title: 'Watches the chain',
    body: 'Listens for new briefs on Arc as they post.',
  },
  {
    n: '02',
    title: 'Scores the brief',
    body: 'Matches each brief against your skills and ranges. Bids or skips.',
  },
  {
    n: '03',
    title: 'Bids, negotiates',
    body: 'Submits on chain. Replies to counters inside your range.',
  },
];

export default function SellerPage() {
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
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

  if (!isConnected) {
    return (
      <SignInGate
        variant="page"
        tag="SELLER DESK"
        body="Listings and bids are keyed to your wallet. Sign in to set up the seller agent."
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
                SELLER DESK
              </SectionTag>
            </div>
            <div className="fade-up fade-up-1">
              <HeroHeadline>
                Bids land
                <br />
                while you <Accent>sleep</Accent>
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            <p className="fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
              Listens for briefs. Bids inside the ranges you set. Wake up to matched deals.
            </p>
            <div className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#post-listing"
                className="group inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_0_rgba(0,0,0,0.22)] hover:shadow-[0_5px_0_rgba(0,0,0,0.22)] active:shadow-[0_1px_0_rgba(0,0,0,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-dark)]"
                style={{
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  borderBottomLeftRadius: 14,
                  borderBottomRightRadius: 4,
                }}
              >
                Post a listing ↓
              </a>
              {address && (
                <span className="ml-1">
                  <AddressPill address={shortAddress(address)} tone="dark" />
                </span>
              )}
            </div>
          </div>
          <div className="hidden lg:block fade-up fade-up-4">
            <SellerAgentVignette activated={activated} bidsCount={activeBids.length} />
          </div>
        </div>
      </Band>

      {/* PENDING MATCHES. shared component, renders nothing when empty. */}
      <PendingMatchesBand tone="light" headline="Your bid matched" />

      {/* HOW IT WORKS */}
      <Band tone="light" compact>
        <SectionTag>HOW IT WORKS</SectionTag>
        <HeroHeadline size="md">
          Three loops<Punc>.</Punc>
          <br />
          <Accent>One agent.</Accent>
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          Every activated wallet runs a seller agent. Set skills and ranges on profile, post listings here to broadcast supply.
        </p>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {STEPS.map((s, i) => (
            <div key={s.n} className={`fade-up fade-up-${i + 1}`}>
              <StepCard n={s.n} title={s.title} body={s.body} />
            </div>
          ))}
        </div>
      </Band>

      {/* POST LISTING */}
      <Band tone="dark" compact>
        <div id="post-listing" className="scroll-mt-20" />
        <SectionTag tone="dark">POST WHAT YOU OFFER</SectionTag>
        <HeroHeadline size="md">
          Standing offer<Punc>.</Punc>
          <br />
          Set the floor.
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
          Publish a listing at your asking price. Matches land in your inbox.
        </p>
        <div className="mt-10 grid lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2">
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
              <div className="p-6 md:p-8">
                <PostListingForm />
              </div>
            </div>
          </div>
          <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} />
        </div>
      </Band>

      {/* DIRECT DEALS */}
      <Band tone="light" compact>
        <SectionTag>DIRECT DEALS</SectionTag>
        <HeroHeadline size="md">
          Deals <Accent>for you</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          Direct deals where your wallet is the named seller, with their live escrow state.
        </p>
        <div className="mt-10">
          <PageCard>
            <DirectDealList role="seller" />
          </PageCard>
        </div>
      </Band>

      {/* ACTIVE BIDS */}
      <Band tone="dark" compact>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[46ch]">
            <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
              ACTIVE BIDS
            </SectionTag>
            <HeroHeadline size="md">
              In the auction
              {activeBids.length > 0 && (
                <>
                  <Punc>.</Punc>
                  <span className="ml-3 text-white/55 font-sans font-extrabold">
                    {activeBids.length}
                  </span>
                </>
              )}
              {activeBids.length === 0 && <Punc>.</Punc>}
            </HeroHeadline>
            <p className="mt-5 text-pretty text-[14px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
              Bids placed on open briefs. Counters reply automatically inside your range.
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
                Connect your wallet to see your active bids.
              </p>
            ) : fetchState === 'error' ? (
              <p className="p-8 text-center text-[13px] text-[#ff8a7a]">
                Couldn&apos;t load your bids.
              </p>
            ) : fetchState === 'loading' || fetchState === 'idle' ? (
              <div className="p-8 space-y-3">
                <div className="h-14 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
                <div className="h-14 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
              </div>
            ) : activeBids.length === 0 ? (
              <p className="p-8 text-center text-[13px] text-white/55">
                No active bids. Post a listing to start scanning briefs.
              </p>
            ) : (
              <BidsTable bids={activeBids} />
            )}
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div
      className="group relative overflow-hidden p-6 transition-[transform,box-shadow] duration-300 ease-out card-shimmer hover:-translate-y-1"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 5,
        boxShadow:
          '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -16px rgba(0,0,0,0.10)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-sans text-[28px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]/30 leading-none">
          {n}
        </span>
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--lp-light)] transition-transform duration-200 group-hover:rotate-[20deg] group-hover:translate-x-0.5"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path
              d="M5 11l6-6M5.5 5h5.5v5.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <h3 className="mt-5 font-sans text-[19px] font-extrabold uppercase tracking-[-0.02em] leading-[1.05]">
        {title}
      </h3>
      <p className="mt-3 text-pretty text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
        {body}
      </p>
    </div>
  );
}

function SellerAgentVignette({
  activated,
  bidsCount,
}: {
  activated: boolean;
  bidsCount: number;
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
            <span aria-hidden className="w-[7px] h-[7px] rounded-full bg-white/30" />
          )}
        </div>
        <p className="mt-4 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] text-white">
          Seller agent{' '}
          <span style={{ color: activated ? 'var(--lp-accent)' : 'rgba(255,255,255,0.5)' }}>
            {activated ? 'active' : 'idle'}
          </span>
        </p>
        <p className="mt-1.5 text-[12px] text-white/55 leading-relaxed">
          {activated
            ? 'Watching briefs. Scoring against skills. Bidding on match.'
            : 'Activate on profile to start bidding.'}
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/[0.08]">
        <div className="px-4 py-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">In auction</p>
          <p className="mt-1.5 font-sans text-[24px] font-extrabold tabular-nums tracking-[-0.02em]">
            {bidsCount}
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">Counters</p>
          <p className="mt-1.5 font-sans text-[24px] font-extrabold tabular-nums tracking-[-0.02em]">
            ∞
          </p>
          <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.1em] text-white/45">
            within range
          </p>
        </div>
      </div>
    </div>
  );
}

