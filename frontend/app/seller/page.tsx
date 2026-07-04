'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type SellerActiveBid } from '@/core/api';
import { PendingMatchesBand } from '@/features/notifications/components/PendingMatchesBand';
import { PendingDealsBand } from '@/features/notifications/components/PendingDealsBand';
import { useActivation } from '@/shared/hooks/useActivation';
import { BidsTable } from '@/features/seller/components/BidsTable';
import { ListingComposer } from '@/features/seller/components/ListingComposer';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
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

export default function SellerPage() {
  const sh = useTranslations().sellerHub;
  return (
    <AuthGuard gateTag={sh.signInGate.tag} gateBody={sh.signInGate.body}>
      <SellerPageInner />
    </AuthGuard>
  );
}

function SellerPageInner() {
  const auth = useAuth();
  const address = auth.address;
  const { activated, agents } = useActivation();
  const [activeBids, setActiveBids] = useState<SellerActiveBid[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const sh = useTranslations().sellerHub;

  useEffect(() => {
    if (!address) {
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
  }, [address]);

  const steps = [
    { n: '01', title: sh.steps.s1.title, body: sh.steps.s1.body },
    { n: '02', title: sh.steps.s2.title, body: sh.steps.s2.body },
    { n: '03', title: sh.steps.s3.title, body: sh.steps.s3.body },
  ];

  return (
    <FullBleed>
      {/* HERO. compact title row so the desk work sits near the fold. */}
      <Band tone="dark" compact overlay={<GridOverlay />}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
          <div className="min-w-0">
            <div className="fade-up">
              <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
                {sh.hero.tag}
              </SectionTag>
            </div>
            <div className="fade-up fade-up-1">
              <HeroHeadline size="sm">
                {sh.hero.headlineLine1}
                <br />
                {sh.hero.headlineLine2Prefix} <Accent>{sh.hero.headlineAccent}</Accent>
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            <p className="fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
              {sh.hero.lede}
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
                {sh.hero.ctaPostOffer}
              </a>
              {address && (
                <span className="ms-1">
                  <AddressPill address={shortAddress(address)} tone="dark" />
                </span>
              )}
            </div>
          </div>
          <div className="hidden lg:block fade-up fade-up-4">
            <SellerAgentVignette
              activated={activated}
              bidsCount={activeBids.length}
              copy={sh.vignette}
            />
          </div>
        </div>
      </Band>

      {/* ACTIVATE NOTICE. shared band, renders nothing once activated. Catches
          the dead end where a seller profile is saved but no agent was ever
          provisioned, so the seller agent silently never bids. */}
      <ActivateAgentsNotice role="seller" tone="light" />

      {/* PENDING MATCHES. shared component, renders nothing when empty. */}
      <PendingMatchesBand tone="light" headline={sh.pendingMatchesHeadline} />
      {/* DEALS AWAITING ACTION. direct deals needing accept/release. */}
      <PendingDealsBand tone="light" />

      {/* HOW IT WORKS */}
      <Band tone="light" compact>
        <SectionTag>{sh.howItWorks.tag}</SectionTag>
        <HeroHeadline size="md">
          {sh.howItWorks.headlineLine1}<Punc>.</Punc>
          <br />
          <Accent>{sh.howItWorks.headlineLine2Accent}</Accent>
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          {sh.howItWorks.lede}
        </p>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          {steps.map((s, i) => (
            <div key={s.n} className={`fade-up fade-up-${i + 1}`}>
              <StepCard n={s.n} title={s.title} body={s.body} />
            </div>
          ))}
        </div>
      </Band>

      {/* POST LISTING */}
      <Band tone="dark" compact>
        <div id="post-listing" className="scroll-mt-20" />
        <SectionTag tone="dark">{sh.postOffer.tag}</SectionTag>
        <HeroHeadline size="md">
          {sh.postOffer.headlineLine1}<Punc>.</Punc>
          <br />
          {sh.postOffer.headlineLine2}
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
          {sh.postOffer.lede}
        </p>
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="min-w-0 lg:col-span-2">
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
                <ListingComposer />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} />
            {SCOUT_ENABLED && <MarketScout />}
          </div>
        </div>
      </Band>

      {/* ACTIVE BIDS */}
      <Band tone="dark" compact>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[46ch]">
            <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
              {sh.activeBids.tag}
            </SectionTag>
            <HeroHeadline size="md">
              {sh.activeBids.headline}
              {activeBids.length > 0 && (
                <>
                  <Punc>.</Punc>
                  <span className="ms-3 text-white/55 font-sans font-extrabold">
                    {activeBids.length}
                  </span>
                </>
              )}
              {activeBids.length === 0 && <Punc>.</Punc>}
            </HeroHeadline>
            <p className="mt-5 text-pretty text-[14px] leading-relaxed text-[var(--lp-text-muted)] max-w-[46ch]">
              {sh.activeBids.lede}
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
                {sh.activeBids.errorMessage}
              </p>
            ) : fetchState === 'loading' || fetchState === 'idle' ? (
              <div className="p-8 space-y-3">
                <div className="h-14 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
                <div className="h-14 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
              </div>
            ) : activeBids.length === 0 ? (
              <p className="p-8 text-center text-[13px] text-white/55">
                {sh.activeBids.emptyMessage}
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
  copy,
}: {
  activated: boolean;
  bidsCount: number;
  copy: Messages['sellerHub']['vignette'];
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
            {copy.agentControl}
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
          {copy.sellerAgent}{' '}
          <span style={{ color: activated ? 'var(--lp-accent)' : 'rgba(255,255,255,0.5)' }}>
            {activated ? copy.statusActive : copy.statusIdle}
          </span>
        </p>
        <p className="mt-1.5 text-[12px] text-white/55 leading-relaxed">
          {activated ? copy.activeBlurb : copy.idleBlurb}
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/[0.08]">
        <div className="px-4 py-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">{copy.inAuction}</p>
          <p className="mt-1.5 font-sans text-[24px] font-extrabold tabular-nums tracking-[-0.02em]">
            {bidsCount}
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">{copy.counters}</p>
          <p className="mt-1.5 font-sans text-[24px] font-extrabold tabular-nums tracking-[-0.02em]">
            ∞
          </p>
          <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.1em] text-white/45">
            {copy.withinRange}
          </p>
        </div>
      </div>
    </div>
  );
}
