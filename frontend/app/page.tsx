'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';
/// HeroFlow drives the landing hero animation; StatsTicker lives below the
/// fold. Dynamically imported so the motion-heavy bundles do not block first
/// paint on `/`. SSR off because both run animation effects only on the
/// client.
const HeroFlow = dynamic(
  () => import('@/features/activity/components/HeroFlow').then((m) => m.HeroFlow),
  { ssr: false },
);
const StatsTicker = dynamic(
  () => import('@/features/activity/components/StatsTicker').then((m) => m.StatsTicker),
  { ssr: false },
);
import { PartnerLogos } from '@/shared/components/PartnerLogos';
import { cn } from '@/shared/utils/cn';
import { StickyTabStrip, type Tab } from '@/shared/components/skill';
import { dur, ease } from '@/shared/motion/tokens';

type LandingCopy = Messages['landingPage'];

export default function HomePage() {
  const lp = useTranslations().landingPage;
  const [active, setActive] = useState<string>('overview');

  const tabs: Tab[] = [
    { id: 'overview', label: lp.tabs.overview, hash: 'overview' },
    { id: 'how-it-works', label: lp.tabs.howItWorks, hash: 'how-it-works' },
    { id: 'flow', label: lp.tabs.flow, hash: 'flow' },
    { id: 'get-started', label: lp.tabs.getStarted, hash: 'get-started' },
  ];

  // Load top-down. The browser's default scroll restoration drops a refresh
  // back at the last position (often the footer), which also makes the
  // once-only scroll reveals fire out of order so scrolling up shows nothing.
  // Take manual control, start at the top (unless deep-linking to a hash), and
  // hand restoration back when leaving the page.
  useEffect(() => {
    const supported = 'scrollRestoration' in window.history;
    const prev = supported ? window.history.scrollRestoration : undefined;
    if (supported) window.history.scrollRestoration = 'manual';
    if (!window.location.hash) window.scrollTo(0, 0);
    return () => {
      if (supported && prev) window.history.scrollRestoration = prev;
    };
  }, []);

  // Drive sticky tab active state from scroll position.
  useEffect(() => {
    const ids = tabs.map((t) => t.hash).filter(Boolean) as string[];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="-mt-10 -mb-10">
      <StatsTicker />

      <StickyTabStrip tabs={tabs} active={active} onChange={setActive} onDark />

      {/* HERO. dark, anchored as OVERVIEW */}
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
          <motion.div
            className="space-y-7"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.slow, ease: ease.out }}
          >
            <SectionTag tone="dark">{lp.hero.tag}</SectionTag>
            <h1 className="font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.95] text-balance text-[clamp(2.75rem,7vw,5.75rem)]">
              {lp.hero.titleLine1}<br />{lp.hero.titleLine2}{' '}
              <span className="text-[var(--lp-accent)]">{lp.hero.titleAccent}</span>
            </h1>
            <p className="text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-md">
              {lp.hero.body}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <CTAPill href="/app">{lp.hero.ctaPrimary}</CTAPill>
              <CTAPill href="/how-it-works" variant="secondary" tone="dark">
                {lp.hero.ctaSecondary}
              </CTAPill>
            </div>
            <p className="mono text-[12px] text-[var(--lp-text-sub)]">
              {lp.hero.footnote}
            </p>
          </motion.div>
          <div className="lg:justify-self-end w-full max-w-md lg:max-w-none">
            <HeroFlow />
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-[clamp(16px,3vw,30px)] flex justify-center">
          <ScrollCue label="Scroll" />
        </div>
      </Band>

      {/* ECOSYSTEM. light */}
      <Band tone="light" compact>
        <div className="space-y-6">
          <SectionTag>{lp.ecosystem.tag}</SectionTag>
          <PartnerLogos />
        </div>
      </Band>

      {/* DIRECT DEALS. light */}
      <Band tone="light">
        <Reveal>
          <SectionTag>{lp.directDeals.tag}</SectionTag>
          <h2 className="mt-5 font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.98] text-balance text-[clamp(2.25rem,4.6vw,4rem)]">
            {lp.directDeals.title}
          </h2>
          <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-xl">
            {lp.directDeals.body}
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mt-10 grid sm:grid-cols-2 gap-5">
            <FeatureTile
              glyph={<GlyphWallet />}
              title={lp.directDeals.tile1Title}
              body={lp.directDeals.tile1Body}
            />
            <FeatureTile
              glyph={<GlyphTranches />}
              title={lp.directDeals.tile2Title}
              body={lp.directDeals.tile2Body}
            />
          </div>
        </Reveal>
      </Band>

      {/* MANAGED DEALS. dark */}
      <Band tone="dark">
        <Reveal>
          <SectionTag tone="dark">{lp.managedDeals.tag}</SectionTag>
          <h2 className="mt-5 font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.98] text-balance text-[clamp(2.25rem,4.6vw,4rem)]">
            {lp.managedDeals.title}
          </h2>
          <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-xl">
            {lp.managedDeals.body}
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mt-10 grid sm:grid-cols-2 gap-5">
            <FeatureTile
              tone="dark"
              glyph={<GlyphAuction />}
              title={lp.managedDeals.tile1Title}
              body={lp.managedDeals.tile1Body}
            />
            <FeatureTile
              tone="dark"
              glyph={<GlyphSettle />}
              title={lp.managedDeals.tile2Title}
              body={lp.managedDeals.tile2Body}
            />
          </div>
        </Reveal>
      </Band>

      <HowItWorksSection copy={lp.howItWorks} />
      <FlowSection copy={lp.flow} />
      <TradeLanesSection copy={lp.tradeLanes} />
      <EarlyTradesSection copy={lp.earlyTrades} />
      <GetStartedSection copy={lp.getStarted} />

      {/* FINAL CTA. dark */}
      <Band tone="dark" className="text-center">
        <Reveal className="mx-auto max-w-2xl space-y-6">
          <SectionTag tone="dark">
            <span className="sr-only">{lp.finalCta.srLabel}</span>{lp.finalCta.tag}
          </SectionTag>
          <h2 className="font-sans font-extrabold uppercase tracking-[-0.02em] leading-[1.02] text-balance text-[clamp(1.75rem,3.6vw,3rem)]">
            {lp.finalCta.title}
          </h2>
          <p className="text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
            {lp.finalCta.body}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <CTAPill href="/app">{lp.finalCta.ctaPrimary}</CTAPill>
            <CTAPill href="/how-it-works" variant="secondary" tone="dark">
              {lp.finalCta.ctaSecondary}
            </CTAPill>
          </div>
        </Reveal>
      </Band>
    </div>
  );
}

// How it works. three-rails typographic row, replaces the old "spine" grid
function HowItWorksSection({ copy }: { copy: LandingCopy['howItWorks'] }) {
  const rails = [
    { n: '001', title: copy.rail1Title, body: copy.rail1Body },
    { n: '002', title: copy.rail2Title, body: copy.rail2Body },
    { n: '003', title: copy.rail3Title, body: copy.rail3Body },
  ];
  return (
    <Band id="how-it-works" tone="light">
      <Reveal>
        <SectionTag>{copy.tag}</SectionTag>
        <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,5.4vw,4.5rem)] max-w-[18ch]">
          {copy.titleStart} <span className="text-[var(--lp-accent)]">{copy.titleAccent}</span> {copy.titleEnd}
        </h2>
      </Reveal>
      <ol className="mt-14 grid md:grid-cols-3 gap-0">
        {rails.map((r, i) => (
          <motion.li
            key={r.n}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: dur.slow, ease: ease.out, delay: i * 0.08 }}
            className="relative pt-6 px-6 first:ps-0 last:pe-0"
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

// Flow. deal end to end. Six stage chips on a hairline track + three KPIs
function FlowSection({ copy }: { copy: LandingCopy['flow'] }) {
  const steps: Array<{
    tag: string;
    label: string;
    state: 'pos' | 'info' | 'warn';
  }> = [
    { tag: copy.steps.posted.tag, label: copy.steps.posted.label, state: 'pos' },
    { tag: copy.steps.bids.tag, label: copy.steps.bids.label, state: 'info' },
    { tag: copy.steps.accept.tag, label: copy.steps.accept.label, state: 'info' },
    { tag: copy.steps.escrow.tag, label: copy.steps.escrow.label, state: 'warn' },
    { tag: copy.steps.deliver.tag, label: copy.steps.deliver.label, state: 'warn' },
    { tag: copy.steps.settle.tag, label: copy.steps.settle.label, state: 'pos' },
  ];
  return (
    <Band id="flow" tone="dark">
      <Reveal className="flex items-end justify-between gap-6 flex-wrap mb-12">
        <div>
          <SectionTag tone="dark">{copy.tag}</SectionTag>
          <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,5.4vw,4.5rem)] max-w-[18ch]">
            {copy.title}
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
          {copy.liveLabel}
        </p>
      </Reveal>

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
                  borderInlineEnd:
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
                    className="hidden lg:block absolute end-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2"
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
            <KpiBlock label={copy.kpis.avgSettleLabel} value="3.2" unit={copy.kpis.avgSettleUnit} />
            <KpiBlock label={copy.kpis.inFlightLabel} value="1.42" unit={copy.kpis.inFlightUnit} />
            <KpiBlock label={copy.kpis.uptimeLabel} value="99.98" unit="%" live />
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

// Trade lanes. typographic list of corridors by volume
function TradeLanesSection({ copy }: { copy: LandingCopy['tradeLanes'] }) {
  const lanes = [
    { id: `${copy.laneIdPrefix} 001`, from: copy.cities.lagos, to: copy.cities.dubai, vol: '128K', avg: `4 ${copy.minutesUnit}` },
    { id: `${copy.laneIdPrefix} 002`, from: copy.cities.nairobi, to: copy.cities.london, vol: '94K', avg: `6 ${copy.minutesUnit}` },
    { id: `${copy.laneIdPrefix} 003`, from: copy.cities.karachi, to: copy.cities.singapore, vol: '72K', avg: `3 ${copy.minutesUnit}` },
    { id: `${copy.laneIdPrefix} 004`, from: copy.cities.cairo, to: copy.cities.frankfurt, vol: '58K', avg: `5 ${copy.minutesUnit}` },
    { id: `${copy.laneIdPrefix} 005`, from: copy.cities.accra, to: copy.cities.newYork, vol: '47K', avg: `7 ${copy.minutesUnit}` },
    { id: `${copy.laneIdPrefix} 006`, from: copy.cities.darEsSalaam, to: copy.cities.mumbai, vol: '41K', avg: `4 ${copy.minutesUnit}` },
  ];
  return (
    <Band tone="light">
      <Reveal className="flex items-end justify-between gap-6 flex-wrap mb-14">
        <div>
          <SectionTag>{copy.tag}</SectionTag>
          <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,5.4vw,4.5rem)] max-w-[18ch]">
            {copy.titleStart} <span className="text-[var(--lp-accent)]">{copy.titleAccent}</span>{copy.titleEnd}
          </h2>
        </div>
        <p
          className="mono text-[11px] uppercase tracking-[0.1em] max-w-[260px]"
          style={{ color: 'var(--lp-text-sub)' }}
        >
          {copy.footnote}
        </p>
      </Reveal>

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
              <span style={{ color: 'var(--lp-text-sub)' }} aria-label={copy.toAria}>
                →
              </span>{' '}
              {l.to}
            </span>
            <span
              className="md:text-end mono text-[11px] md:text-[12px] tabular-nums uppercase tracking-[0.06em]"
              style={{ color: 'var(--lp-text-sub)' }}
            >
              {l.vol} USDC
            </span>
            <span
              className="md:text-end mono text-[11px] md:text-[12px] tabular-nums uppercase tracking-[0.06em]"
              style={{ color: 'var(--lp-text-sub)' }}
            >
              {copy.avgPrefix} {l.avg}
            </span>
          </motion.li>
        ))}
      </ul>
    </Band>
  );
}

// Early trades. modular cards grid (testimonial-style, big number visual)
function EarlyTradesSection({ copy }: { copy: LandingCopy['earlyTrades'] }) {
  const cards = [
    {
      tag: `${copy.cards.buyerLagos.role} · ${copy.cards.buyerLagos.city}`,
      title: copy.cards.buyerLagos.title,
      value: '12,400',
      unit: copy.cards.buyerLagos.unit,
      sub: copy.cards.buyerLagos.sub,
    },
    {
      tag: `${copy.cards.sellerNairobi.role} · ${copy.cards.sellerNairobi.city}`,
      title: copy.cards.sellerNairobi.title,
      value: '3 / 14',
      unit: copy.cards.sellerNairobi.unit,
      sub: copy.cards.sellerNairobi.sub,
    },
    {
      tag: `${copy.cards.buyerKarachi.role} · ${copy.cards.buyerKarachi.city}`,
      title: copy.cards.buyerKarachi.title,
      value: '0',
      unit: copy.cards.buyerKarachi.unit,
      sub: copy.cards.buyerKarachi.sub,
    },
  ];
  return (
    <Band tone="dark">
      <Reveal>
        <SectionTag tone="dark">{copy.tag}</SectionTag>
        <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,5.4vw,4.5rem)] max-w-[20ch]">
          {copy.title}
        </h2>
      </Reveal>
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

// Get started. three-step accordion
function GetStartedSection({ copy }: { copy: LandingCopy['getStarted'] }) {
  const steps = [
    { n: '001', title: copy.step1Title, body: copy.step1Body },
    { n: '002', title: copy.step2Title, body: copy.step2Body },
    { n: '003', title: copy.step3Title, body: copy.step3Body },
  ];
  const [open, setOpen] = useState<string | null>('001');
  return (
    <Band id="get-started" tone="light">
      <Reveal>
        <SectionTag>{copy.tag}</SectionTag>
        <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(2.5rem,5.4vw,4.5rem)] max-w-[18ch]">
          {copy.title}
        </h2>
      </Reveal>

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
                className="w-full grid grid-cols-[100px_1fr_auto] gap-6 items-baseline py-6 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-inset"
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
                      className="text-[15px] leading-[1.65] pb-7 max-w-[60ch] ms-[100px]"
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

// Layout primitives (kept from prior landing)

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

/* ---- motion helpers ---- */

// Reveal-on-scroll wrapper. Text and section clusters rise and fade in as they
// enter the viewport, once, so reading the page feels like it unfolds. Matches
// the whileInView pattern already used by the list items below the fold.
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: dur.slow, ease: ease.out, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Scroll cue. A minimal mouse with a drifting wheel that tells a first-time
// visitor there is more below the hero. Fades out the moment they start
// scrolling so it never lingers.
function ScrollCue({ label }: { label: string }) {
  const reduce = useReducedMotion();
  // It is pinned to the hero, so it scrolls out of view with the hero on its
  // own. No eager scroll-fade: the cue stays put while the hero is on screen
  // (the old 60px fade made it vanish on the slightest scroll).
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: ease.out, delay: 0.3 }}
      className="pointer-events-none flex flex-col items-center gap-2.5"
    >
      <span
        className="relative inline-flex justify-center"
        style={{
          width: 26,
          height: 40,
          borderRadius: 13,
          border: '1.5px solid rgba(255,255,255,0.32)',
        }}
      >
        <motion.span
          className="absolute top-[7px] block"
          style={{ width: 3, height: 7, borderRadius: 2, background: 'var(--lp-accent)' }}
          animate={reduce ? undefined : { y: [0, 8, 0], opacity: [1, 0.3, 1] }}
          transition={reduce ? undefined : { duration: 1.7, ease: 'easeInOut', repeat: Infinity }}
        />
      </span>
      <span className="mono text-[10px] uppercase tracking-[0.2em] text-[var(--lp-text-muted)]">
        {label}
      </span>
    </motion.div>
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
