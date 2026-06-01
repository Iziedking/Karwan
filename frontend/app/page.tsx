'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { HeroFlow } from '@/features/activity/components/HeroFlow';
import { PartnerLogos } from '@/shared/components/PartnerLogos';
import { StatsTicker } from '@/features/activity/components/StatsTicker';
import { cn } from '@/shared/utils/cn';
import { StickyTabStrip, type Tab } from '@/shared/components/skill';
import { dur, ease } from '@/shared/motion/tokens';

const TABS: Tab[] = [
  { id: 'overview', label: 'OVERVIEW', hash: 'overview' },
  { id: 'how-it-works', label: 'WORKFLOW SUMMARY', hash: 'how-it-works' },
  { id: 'flow', label: 'FLOW', hash: 'flow' },
  { id: 'get-started', label: 'GET STARTED', hash: 'get-started' },
];

export default function HomePage() {
  const [active, setActive] = useState<string>('overview');

  // Drive sticky tab active state from scroll position.
  useEffect(() => {
    const ids = TABS.map((t) => t.hash).filter(Boolean) as string[];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { threshold: [0.2, 0.5, 0.8], rootMargin: '-100px 0px -50% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="-mt-10 -mb-10">
      <StatsTicker />

      <StickyTabStrip tabs={TABS} active={active} onChange={setActive} onDark />

      {/* HERO. dark — anchored as OVERVIEW */}
      <Band
        id="overview"
        tone="dark"
        overlay={
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'linear-gradient(var(--lp-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--lp-border-subtle) 1px, transparent 1px)',
              backgroundSize: '80px 80px',
              maskImage: 'radial-gradient(ellipse 90% 80% at 50% 0%, black, transparent 75%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 90% 80% at 50% 0%, black, transparent 75%)',
            }}
          />
        }
      >
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="space-y-7">
            <SectionTag tone="dark">SETTLEMENT NETWORK</SectionTag>
            <h1 className="font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.95] text-balance text-[clamp(2.75rem,7vw,5.75rem)]">
              Agree. Escrow.<br />Deliver.{' '}
              <span className="text-[var(--lp-accent)]">Settle.</span>
            </h1>
            <p className="text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-md">
              On-chain settlement rails for cross-border SME trade. USDC sits in milestone escrow on Arc. Releases as the work lands.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <CTAPill href="/app">Launch app ↓</CTAPill>
              <CTAPill href="/how-it-works" variant="secondary" tone="dark">
                How it works →
              </CTAPill>
            </div>
            <p className="mono text-[12px] text-[var(--lp-text-sub)]">
              Free on Arc Testnet. No mainnet funds.
            </p>
          </div>
          <div className="lg:justify-self-end w-full max-w-md lg:max-w-none">
            <HeroFlow />
          </div>
        </div>
      </Band>

      {/* ECOSYSTEM. light */}
      <Band tone="light" compact>
        <div className="space-y-6">
          <SectionTag>BUILT ON</SectionTag>
          <PartnerLogos />
        </div>
      </Band>

      {/* DIRECT DEALS. light */}
      <Band tone="light">
        <SectionTag>DIRECT DEALS</SectionTag>
        <h2 className="mt-5 font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.98] text-balance text-[clamp(2.25rem,4.6vw,4rem)]">
          Bring your own counterparty.
        </h2>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-xl">
          You already agreed off-platform. Name the wallet, set the amount, fund the escrow. No auction.
        </p>
        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          <FeatureTile
            glyph={<GlyphWallet />}
            title="Name the wallet"
            body="Point the escrow at your counterparty. They sign in with that wallet, accept the terms, and deliver."
          />
          <FeatureTile
            glyph={<GlyphTranches />}
            title="Release in tranches"
            body="A slice releases on delivery, the rest once you verify. A review window auto-releases if you go quiet."
          />
        </div>
      </Band>

      {/* MANAGED DEALS. dark */}
      <Band tone="dark">
        <SectionTag tone="dark">MANAGED DEALS</SectionTag>
        <h2 className="mt-5 font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.98] text-balance text-[clamp(2.25rem,4.6vw,4rem)]">
          Or let an agent find one.
        </h2>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-xl">
          Post the request. Your agent watches the marketplace and surfaces matches. You approve, escrow funds, milestones release.
        </p>
        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          <FeatureTile
            tone="dark"
            glyph={<GlyphAuction />}
            title="Agents negotiate"
            body="Buyer and seller agents bid and counter on chain, on their own, inside the ranges you set in your profile."
          />
          <FeatureTile
            tone="dark"
            glyph={<GlyphSettle />}
            title="Escrow on acceptance"
            body="When terms land, the buyer agent funds the milestone escrow. Releases follow the same spine as a direct deal."
          />
        </div>
      </Band>

      <HowItWorksSection />
      <FlowSection />
      <TradeLanesSection />
      <EarlyTradesSection />
      <GetStartedSection />

      {/* FINAL CTA. dark */}
      <Band tone="dark" className="text-center">
        <div className="mx-auto max-w-2xl space-y-6">
          <SectionTag tone="dark">
            <span className="sr-only">Get started</span>OPEN A DEAL
          </SectionTag>
          <h2 className="font-sans font-extrabold uppercase tracking-[-0.02em] leading-[1.02] text-balance text-[clamp(1.75rem,3.6vw,3rem)]">
            Open your first deal in about a minute.
          </h2>
          <p className="text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
            Direct or agent-run, your call. Every step is a real transaction on Arc Testnet.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <CTAPill href="/app">Launch app ↓</CTAPill>
            <CTAPill href="/how-it-works" variant="secondary" tone="dark">
              Read how it works →
            </CTAPill>
          </div>
        </div>
      </Band>
    </div>
  );
}

/* ============================================================================
   HOW IT WORKS — three-rails typographic row, replaces the old "spine" grid
   ============================================================================ */
function HowItWorksSection() {
  const rails = [
    {
      n: '001',
      title: 'Escrow in USDC',
      body: 'Funds settle in milestone tranches on Arc. The chain holds the math.',
    },
    {
      n: '002',
      title: 'Milestone release',
      body: 'Releases trigger on signed delivery. Disputes route to human review, never to silence.',
    },
    {
      n: '003',
      title: 'On-chain proof',
      body: 'Every state change emits an event. Audit, reputation, payouts read the same source.',
    },
  ];
  return (
    <Band id="how-it-works" tone="light">
      <SectionTag>THE RAILS</SectionTag>
      <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,5.4vw,4.5rem)] max-w-[18ch]">
        Three rails. <span className="text-[var(--lp-accent)]">One</span> deal.
      </h2>
      <ol className="mt-14 grid md:grid-cols-3 gap-0">
        {rails.map((r, i) => (
          <motion.li
            key={r.n}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: dur.slow, ease: ease.out, delay: i * 0.08 }}
            className="relative pt-6 px-6 first:pl-0 last:pr-0"
            style={{ borderTop: '1px solid var(--lp-border-light)' }}
          >
            <span
              className="mono text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: 'var(--lp-text-sub)' }}
            >
              [:{r.n}]
            </span>
            <h3
              className="mt-5 font-sans font-bold uppercase tracking-[-0.025em] leading-[1.0]"
              style={{ fontSize: 'clamp(28px, 3vw, 44px)', color: 'var(--lp-dark)' }}
            >
              {r.title}
            </h3>
            <p
              className="mt-5 text-[15px] leading-[1.55] max-w-[34ch]"
              style={{ color: 'var(--lp-text-sub)' }}
            >
              {r.body}
            </p>
          </motion.li>
        ))}
      </ol>
    </Band>
  );
}

/* ============================================================================
   FLOW — deal end to end. Six stage chips on a hairline track + three KPIs
   ============================================================================ */
function FlowSection() {
  const steps: Array<{
    tag: string;
    label: string;
    state: 'pos' | 'info' | 'warn';
  }> = [
    { tag: 'POSTED', label: 'Request on chain', state: 'pos' },
    { tag: 'BIDS', label: 'Agents bid & counter', state: 'info' },
    { tag: 'ACCEPT', label: 'Buyer signs match', state: 'info' },
    { tag: 'ESCROW', label: 'USDC funded', state: 'warn' },
    { tag: 'DELIVER', label: 'Seller marks delivered', state: 'warn' },
    { tag: 'SETTLE', label: 'Milestones release', state: 'pos' },
  ];
  return (
    <Band id="flow" tone="dark">
      <div className="flex items-end justify-between gap-6 flex-wrap mb-12">
        <div>
          <SectionTag tone="dark">FLOW</SectionTag>
          <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,5.4vw,4.5rem)] max-w-[18ch]">
            A deal, end to end.
          </h2>
        </div>
        <p
          className="mono text-[12px] uppercase tracking-[0.08em] inline-flex items-center gap-2"
          style={{ color: 'var(--lp-text-muted)' }}
        >
          <span
            aria-hidden
            className="inline-block w-[6px] h-[6px]"
            style={{ background: 'var(--lp-accent)', borderRadius: 1 }}
          />
          LIVE ON ARC TESTNET
        </p>
      </div>

      <div
        className="relative overflow-hidden"
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--lp-border-subtle)',
          borderRadius: 14,
        }}
      >
        <div className="p-8 md:p-12">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-0">
            {steps.map((s, i) => (
              <motion.div
                key={s.tag}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: dur.base, ease: ease.out, delay: i * 0.07 }}
                className="relative px-4 py-6"
                style={{
                  borderRight:
                    i < steps.length - 1 && (i + 1) % 6 !== 0
                      ? '1px solid var(--lp-border-subtle)'
                      : undefined,
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="mono text-[10px] tabular-nums uppercase tracking-[0.1em]"
                    style={{ color: 'var(--lp-text-muted)' }}
                  >
                    [{String(i + 1).padStart(2, '0')}]
                  </span>
                  <FlowChip variant={s.state}>{s.tag}</FlowChip>
                </div>
                <p className="font-sans text-[15px] font-medium leading-tight text-white">
                  {s.label}
                </p>
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2"
                    style={{
                      background: 'var(--lp-accent)',
                      borderRadius: 1,
                      opacity: 0.4,
                    }}
                  />
                )}
              </motion.div>
            ))}
          </div>

          <div
            className="mt-12 pt-8 grid md:grid-cols-3 gap-8"
            style={{ borderTop: '1px solid var(--lp-border-subtle)' }}
          >
            <KpiBlock label="AVG SETTLE" value="3.2" unit="MIN" />
            <KpiBlock label="USDC IN FLIGHT" value="1.42" unit="M" />
            <KpiBlock label="UPTIME" value="99.98" unit="%" live />
          </div>
        </div>
      </div>
    </Band>
  );
}

function FlowChip({
  children,
  variant,
}: {
  children: ReactNode;
  variant: 'pos' | 'info' | 'warn';
}) {
  const c = variant === 'pos' ? '#6BE39A' : variant === 'warn' ? '#FFC857' : '#7CC2FF';
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-[3px] mono text-[9px] font-semibold uppercase tracking-[0.1em] leading-none rounded"
      style={{ background: `${c}14`, border: `1px solid ${c}29`, color: c }}
    >
      <span className="inline-block w-1 h-1 rounded-full" style={{ background: c }} />
      {children}
    </span>
  );
}

function KpiBlock({
  label,
  value,
  unit,
  live = false,
}: {
  label: string;
  value: string;
  unit: string;
  live?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className="mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: 'var(--lp-text-muted)' }}
        >
          [:{label}]
        </span>
        {live && (
          <span className="relative inline-flex w-[6px] h-[6px]">
            <span
              aria-hidden
              className="absolute inset-0 motion-safe:animate-ping"
              style={{
                background: 'var(--lp-accent)',
                opacity: 0.55,
                borderRadius: 1,
                animationDuration: '1.6s',
              }}
            />
            <span
              className="relative inline-block w-[6px] h-[6px]"
              style={{ background: 'var(--lp-accent)', borderRadius: 1 }}
            />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="font-sans font-bold tabular-nums tracking-[-0.025em] leading-none text-white"
          style={{ fontSize: 'clamp(36px, 4vw, 56px)' }}
        >
          {value}
        </span>
        <span
          className="mono text-[12px] uppercase tracking-[0.1em]"
          style={{ color: 'var(--lp-text-muted)' }}
        >
          {unit}
        </span>
      </div>
    </div>
  );
}

/* ============================================================================
   TRADE LANES — typographic list of corridors by volume
   ============================================================================ */
function TradeLanesSection() {
  const lanes = [
    { id: 'LANE 001', from: 'LAGOS', to: 'DUBAI', vol: '128K', avg: '4 MIN' },
    { id: 'LANE 002', from: 'NAIROBI', to: 'LONDON', vol: '94K', avg: '6 MIN' },
    { id: 'LANE 003', from: 'KARACHI', to: 'SINGAPORE', vol: '72K', avg: '3 MIN' },
    { id: 'LANE 004', from: 'CAIRO', to: 'FRANKFURT', vol: '58K', avg: '5 MIN' },
    { id: 'LANE 005', from: 'ACCRA', to: 'NEW YORK', vol: '47K', avg: '7 MIN' },
    { id: 'LANE 006', from: 'DAR ES SALAAM', to: 'MUMBAI', vol: '41K', avg: '4 MIN' },
  ];
  return (
    <Band tone="light">
      <div className="flex items-end justify-between gap-6 flex-wrap mb-14">
        <div>
          <SectionTag>TRADE LANES</SectionTag>
          <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,5.4vw,4.5rem)] max-w-[18ch]">
            The corridors, by <span className="text-[var(--lp-accent)]">volume</span>.
          </h2>
        </div>
        <p
          className="mono text-[11px] uppercase tracking-[0.1em] max-w-[260px]"
          style={{ color: 'var(--lp-text-sub)' }}
        >
          24h on-chain. Rolling. Every lane settles on Arc.
        </p>
      </div>

      <ul>
        {lanes.map((l, i) => (
          <motion.li
            key={l.id}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: dur.base, ease: ease.out, delay: i * 0.04 }}
            className="group flex flex-col md:grid md:grid-cols-[150px_1fr_120px_120px] gap-2 md:gap-6 md:items-baseline py-4 md:py-5"
            style={{
              borderTop: '1px solid var(--lp-border-light)',
              borderBottom:
                i === lanes.length - 1 ? '1px solid var(--lp-border-light)' : undefined,
            }}
          >
            <span
              className="mono text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: 'var(--lp-text-sub)' }}
            >
              [:{l.id}]
            </span>
            <span
              className="font-sans font-bold uppercase tracking-[-0.02em] leading-tight md:leading-none"
              style={{ fontSize: 'clamp(18px, 2vw, 28px)', color: 'var(--lp-dark)' }}
            >
              {l.from}{' '}
              <span style={{ color: 'var(--lp-text-sub)' }} aria-label="to">
                →
              </span>{' '}
              {l.to}
            </span>
            <span
              className="md:text-right mono text-[11px] md:text-[12px] tabular-nums uppercase tracking-[0.06em]"
              style={{ color: 'var(--lp-text-sub)' }}
            >
              {l.vol} USDC
            </span>
            <span
              className="md:text-right mono text-[11px] md:text-[12px] tabular-nums uppercase tracking-[0.06em]"
              style={{ color: 'var(--lp-text-sub)' }}
            >
              AVG {l.avg}
            </span>
          </motion.li>
        ))}
      </ul>
    </Band>
  );
}

/* ============================================================================
   EARLY TRADES — modular cards grid (testimonial-style, big number visual)
   ============================================================================ */
function EarlyTradesSection() {
  const cards = [
    {
      tag: 'BUYER · LAGOS',
      title: 'Settled a Dubai logistics invoice in 4 minutes',
      value: '12,400',
      unit: 'USDC',
      sub: 'paid in 3 milestones',
    },
    {
      tag: 'SELLER · NAIROBI',
      title: 'Agent bid 14 requests while I slept, won 3',
      value: '3 / 14',
      unit: 'WON',
      sub: 'zero manual touches',
    },
    {
      tag: 'BUYER · KARACHI',
      title: 'Dispute window resolved with no chargeback',
      value: '0',
      unit: 'DISPUTES',
      sub: 'last 90 days',
    },
  ];
  return (
    <Band tone="dark">
      <SectionTag tone="dark">EARLY TRADES</SectionTag>
      <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,5.4vw,4.5rem)] max-w-[20ch]">
        What&apos;s landing on the rail.
      </h2>
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.tag}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: dur.base, ease: ease.out, delay: i * 0.06 }}
            whileHover={{ y: -2 }}
            className="group relative flex flex-col p-7 aspect-[4/5]"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--lp-border-subtle)',
              borderRadius: 14,
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <span
                className="mono text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'var(--lp-text-muted)' }}
              >
                [:{c.tag}]
              </span>
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-9 h-9 rounded-full transition-transform duration-150 group-hover:translate-x-1"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
              <div className="flex items-baseline gap-2">
                <span
                  className="font-sans font-bold tabular-nums tracking-[-0.03em] leading-none text-white"
                  style={{ fontSize: 'clamp(40px, 5vw, 64px)' }}
                >
                  {c.value}
                </span>
                <span
                  className="mono text-[12px] uppercase tracking-[0.1em]"
                  style={{ color: 'var(--lp-text-muted)' }}
                >
                  {c.unit}
                </span>
              </div>
              <p
                className="mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--lp-text-muted)' }}
              >
                {c.sub}
              </p>
            </div>

            <p className="mt-5 font-sans text-[18px] font-bold uppercase tracking-[-0.02em] leading-[1.1] text-white">
              {c.title}
            </p>
          </motion.div>
        ))}
      </div>
    </Band>
  );
}

/* ============================================================================
   GET STARTED — three-step accordion
   ============================================================================ */
function GetStartedSection() {
  const steps = [
    {
      n: '001',
      title: 'Sign in',
      body:
        'Bring a web3 wallet or sign in with email & passkey. Either way you get a Circle wallet. Your address is the key.',
    },
    {
      n: '002',
      title: 'Set your ranges',
      body:
        'Buyer side, set budget, deadlines, milestone splits. Seller side, set skills, range, response time. Your agents read these on every match.',
    },
    {
      n: '003',
      title: 'Stake to grow reputation',
      body:
        'Deposit USDC in the vault. The longer it sits, the more reputation you earn. On mainnet that same stake also earns yield through USYC. Withdrawals wait 7 days while the system runs fraud checks.',
    },
  ];
  const [open, setOpen] = useState<string | null>('001');
  return (
    <Band id="get-started" tone="light">
      <SectionTag>GET STARTED</SectionTag>
      <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,5.4vw,4.5rem)] max-w-[18ch]">
        Three steps to a deal.
      </h2>

      <ul className="mt-14">
        {steps.map((s, i) => {
          const isOpen = open === s.n;
          return (
            <li
              key={s.n}
              style={{
                borderTop: '1px solid var(--lp-border-light)',
                borderBottom:
                  i === steps.length - 1 ? '1px solid var(--lp-border-light)' : undefined,
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.n)}
                className="w-full grid grid-cols-[100px_1fr_auto] gap-6 items-baseline py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-inset"
              >
                <span
                  className="mono text-[11px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: 'var(--lp-text-sub)' }}
                >
                  [:{s.n}]
                </span>
                <span
                  className="font-sans font-bold uppercase tracking-[-0.025em] leading-none"
                  style={{ fontSize: 'clamp(24px, 2.8vw, 36px)', color: 'var(--lp-dark)' }}
                >
                  {s.title}
                </span>
                <span
                  aria-hidden
                  className="transition-transform duration-150"
                  style={{
                    fontSize: 18,
                    color: isOpen ? 'var(--lp-accent)' : 'var(--lp-text-sub)',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  v
                </span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: dur.base, ease: ease.out }}
                    className="overflow-hidden"
                  >
                    <p
                      className="text-[15px] leading-[1.65] pb-7 max-w-[60ch] ml-[100px]"
                      style={{ color: 'var(--lp-text-sub)' }}
                    >
                      {s.body}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </Band>
  );
}

/* ============================================================================
   LAYOUT PRIMITIVES (kept from prior landing)
   ============================================================================ */

function Band({
  id,
  tone,
  children,
  className,
  compact,
  overlay,
}: {
  id?: string;
  tone: 'dark' | 'light';
  children: ReactNode;
  className?: string;
  compact?: boolean;
  overlay?: ReactNode;
}) {
  const dark = tone === 'dark';
  return (
    <section
      id={id}
      className={cn(
        'relative left-1/2 w-bleed -translate-x-1/2 overflow-hidden scroll-mt-24',
        dark
          ? 'bg-[var(--lp-band-dark)] text-white'
          : 'bg-[var(--lp-light)] text-[var(--lp-dark)]',
      )}
    >
      {overlay}
      <div
        className={cn(
          'relative mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)]',
          compact ? 'py-[clamp(36px,5vw,64px)]' : 'py-[clamp(64px,9vw,140px)]',
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/* ---- ui primitives ---- */

function SectionTag({
  children,
  tone = 'light',
}: {
  children: ReactNode;
  tone?: 'dark' | 'light';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 mono text-[12px] font-medium uppercase tracking-[0.08em]',
        tone === 'dark' ? 'text-[var(--lp-text-muted)]' : 'text-[var(--lp-text-sub)]',
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
      [:{children}]
    </span>
  );
}

function CTAPill({
  href,
  children,
  variant = 'primary',
  tone = 'dark',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  tone?: 'dark' | 'light';
}) {
  const base =
    'inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase ' +
    'tracking-[0.08em] rounded-tl-[14px] rounded-tr-[14px] rounded-br-[4px] rounded-bl-[14px] ' +
    'transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2';
  if (variant === 'primary') {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] shadow-[0_4px_0_rgba(0,0,0,0.22)]',
          tone === 'dark'
            ? 'focus-visible:ring-offset-[var(--lp-dark)]'
            : 'focus-visible:ring-offset-[var(--lp-light)]',
        )}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        base,
        tone === 'dark'
          ? 'border border-white/25 text-white hover:border-white/55 focus-visible:ring-offset-[var(--lp-dark)]'
          : 'border border-black/20 text-[var(--lp-dark)] hover:border-black/45 focus-visible:ring-offset-[var(--lp-light)]',
      )}
    >
      {children}
    </Link>
  );
}

function FeatureTile({
  glyph,
  title,
  body,
  tone = 'light',
}: {
  glyph: ReactNode;
  title: string;
  body: string;
  tone?: 'dark' | 'light';
}) {
  return (
    <div>
      <span
        aria-hidden
        className="inline-flex size-14 items-center justify-center rounded-xl bg-[var(--lp-card)] text-[var(--lp-dark)] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)]"
      >
        {glyph}
      </span>
      <h3 className="mt-4 text-[16px] font-bold uppercase tracking-[-0.01em]">{title}</h3>
      <p
        className={cn(
          'mt-2 text-pretty text-[13px] leading-relaxed',
          tone === 'dark' ? 'text-[var(--lp-text-muted)]' : 'text-[var(--lp-text-sub)]',
        )}
      >
        {body}
      </p>
    </div>
  );
}

/* ---- line glyphs ---- */

function GlyphWallet() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="13.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

function GlyphTranches() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="4" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="10" height="4" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 16h5M19 13.5l2.5 2.5L19 18.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GlyphAuction() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 15l6-6M8 6l4 4M14 12l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 21h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="13" y="13" width="6" height="6" rx="1.2" transform="rotate(45 16 16)" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function GlyphSettle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
