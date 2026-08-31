'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { api } from '@/core/api';
import type { Messages } from '@/shared/i18n/messages/en';
import { cn } from '@/shared/utils/cn';
import { StickyTabStrip, type Tab } from '@/shared/components/skill';
import { dur, ease } from '@/shared/motion/tokens';
import { RealityHero } from '@/features/home/components/RealityHero';
import {
  advanceToNextPanel,
  PanelActiveProvider,
  PanelAdvance,
  PanelContent,
  PanelMedia,
  useIsPanelViewport,
  usePanelFilling,
  usePanelSnap,
} from '@/features/home/components/panels';

type LandingCopy = Messages['landingPage'];

/* The public landing page is Karwan's fixed-dark editorial front door. App
   theme preferences begin inside the workspace and must never recolor it. */
const LANDING_DARK_VARS = {
  '--lp-workspace-band': 'var(--lp-band-dark)',
  '--lp-workspace-raised': 'rgba(255,255,255,0.04)',
  '--lp-workspace-ink': '#FFFFFF',
  '--lp-workspace-muted': 'rgba(255,255,255,0.62)',
  '--lp-workspace-faint': 'rgba(255,255,255,0.45)',
  '--lp-workspace-border': 'rgba(255,255,255,0.10)',
  '--lp-workspace-soft': 'rgba(255,255,255,0.06)',
  '--lp-workspace-grid': 'rgba(255,255,255,0.06)',
} as CSSProperties;

const LANDING_PAGE_VARS = {
  '--lp-light': 'var(--karwan-canvas)',
  '--lp-bg': 'var(--karwan-canvas)',
  '--lp-paper': 'var(--karwan-canvas)',
  '--lp-cream': 'var(--karwan-canvas)',
  '--lp-card': 'var(--karwan-card)',
  '--lp-field': 'var(--karwan-card)',
  '--lp-dark': 'var(--ink-inv-0)',
  '--lp-ink': 'var(--ink-inv-0)',
  '--lp-text-sub': 'var(--ink-inv-2)',
  '--lp-text-muted': 'var(--ink-inv-2)',
  '--lp-border-light': 'var(--rule-light)',
  '--lp-outline': 'rgba(0,0,0,0.15)',
  '--lp-outline-strong': 'rgba(0,0,0,0.22)',
  '--lp-outline-hover': 'rgba(0,0,0,0.40)',
} as CSSProperties;

export default function HomePage() {
  const lp = useTranslations().landingPage;
  const [active, setActive] = useState<string>('overview');
  // Rows snap to the screen on a phone. Scoped to this page's lifetime so no
  // other route inherits the behaviour.
  usePanelSnap();

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
    <div className="-mt-10 -mb-10" style={LANDING_PAGE_VARS}>
      <StickyTabStrip tabs={tabs} active={active} onChange={setActive} onDark />

      {/* HERO. A real trade-lane film carries the emotional weight; the copy
          remains centered, sparse, and readable over a controlled scrim. The
          film is sized to the exact free height of the screen, so the row under
          it never shows an edge of itself along the bottom. */}
      <Band id="overview" tone="dark" panel className="!max-w-none !px-0 !py-0">
        <RealityHero />
        <div className="absolute inset-x-0 bottom-[clamp(14px,3vw,28px)] flex justify-center">
          <NextRowCue label={lp.scrollCue} />
        </div>
      </Band>
      <HowItWorksSection copy={lp.howItWorks} />
      <DealPathsSection direct={lp.directDeals} managed={lp.managedDeals} />

      <FlowSection copy={lp.flow} />
      <TradeLanesSection copy={lp.tradeLanes} />
      <EarlyTradesSection copy={lp.earlyTrades} />
      <GetStartedSection copy={lp.getStarted} />

      {/* FINAL CTA. dark */}
      <Band tone="dark" panel className="text-center">
        <PanelContent className="mx-auto max-w-2xl space-y-6">
          {/* The screen-reader label sits outside the bracket tag: inside it,
              the hidden span's surrounding whitespace rendered as a gap after
              the colon, so the tag read "[: OPEN A DEAL]". */}
          <span className="sr-only">{lp.finalCta.srLabel}</span>
          <SectionTag tone="dark">{lp.finalCta.tag}</SectionTag>
          <h2 className="font-sans font-extrabold uppercase tracking-[-0.02em] leading-[1.02] text-balance text-[clamp(1.75rem,3.6vw,3rem)]">
            {lp.finalCta.title}
          </h2>
          <p className="text-pretty text-[15px] leading-relaxed text-[var(--lp-workspace-muted)]">
            {lp.finalCta.body}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <CTAPill href="/app">{lp.finalCta.ctaPrimary}</CTAPill>
            <CTAPill href="/how-it-works" variant="secondary" tone="dark">
              {lp.finalCta.ctaSecondary}
            </CTAPill>
          </div>
        </PanelContent>
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
    <Band id="how-it-works" tone="light" panel="grow" className="!px-0 !py-0">
      <div className="relative isolate overflow-hidden border-y border-[var(--lp-border-light)]" style={{ background: 'var(--lp-light)' }}>
        <div className="relative mx-auto grid max-w-[1440px] lg:min-h-[620px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          {/* The freight cutout is this row's media layer: it drifts against the
              scroll and dims as the row leaves, the same grammar as the film
              above it. Sized off the viewport on a phone so the copy under it
              always has room, rather than off a fixed 360px that pushed the
              headline off a small screen. */}
          <div className="relative h-[36svh] overflow-hidden lg:h-auto lg:min-h-[620px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(180,210,82,0.18),transparent_58%)]" aria-hidden="true" />
            <PanelMedia travel={18} dim={0.62}>
              <img
                src="/media/landing/escrow-cutout.png"
                alt=""
                className="absolute bottom-0 start-1/2 h-[86%] w-[112%] max-w-none -translate-x-1/2 object-contain object-center"
                style={{
                  WebkitMaskImage: 'radial-gradient(ellipse at center, #000 44%, transparent 86%)',
                  maskImage: 'radial-gradient(ellipse at center, #000 44%, transparent 86%)',
                }}
              />
            </PanelMedia>
          </div>
          <div className="relative z-10 flex flex-col justify-center px-[clamp(20px,5vw,72px)] py-[clamp(28px,8vw,112px)] lg:ps-[clamp(28px,4vw,68px)]">
            <PanelContent>
            <SectionTag>{copy.tag}</SectionTag>
            <h2 className="mt-6 max-w-[11ch] font-sans text-[clamp(1.85rem,5.4vw,5rem)] font-extrabold uppercase leading-[0.92] tracking-[-0.035em] text-balance">
              {copy.titleStart} <span className="text-[var(--lp-accent-on-light)]">{copy.titleAccent}</span> {copy.titleEnd}
            </h2>
            <p className="mt-7 max-w-[38ch] text-[15px] leading-[1.6] text-[var(--lp-text-sub)]">
              Funds, delivery, and proof stay in one visible settlement path.
            </p>
            </PanelContent>
            <ol className="mt-8 grid border-t border-[var(--lp-border-light)] sm:mt-12">
            {rails.map((r, i) => (
              <motion.li
                key={r.n}
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: dur.slow, ease: ease.out, delay: i * 0.08 }}
                className="grid grid-cols-[52px_1fr] gap-4 border-b border-[var(--lp-border-light)] py-5 sm:grid-cols-[64px_1fr] sm:gap-5 sm:py-6"
              >
                <span className="mono pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">[:{r.n}]</span>
                <div>
                  <h3 className="font-sans text-[clamp(1.35rem,2.6vw,2.1rem)] font-bold uppercase leading-[0.98] tracking-[-0.025em] text-[var(--lp-dark)]">
                    {r.title}
                  </h3>
                  <p className="mt-3 max-w-[42ch] text-[14px] leading-[1.5] text-[var(--lp-text-sub)]">{r.body}</p>
                </div>
              </motion.li>
            ))}
            </ol>
          </div>
        </div>
      </div>
    </Band>
  );
}

function DealPathsSection({ direct, managed }: { direct: LandingCopy['directDeals']; managed: LandingCopy['managedDeals'] }) {
  const pb = useTranslations().pageBits;
  const cards = [
    // The direct path is a human agreement, so the handshake is the visual
    // shorthand. Agent matching gets its own cutout, separated from the source
    // artwork's background so both halves share one Karwan surface.
    { copy: direct, image: '/media/landing/onboard-cutout.png', glyph: <GlyphWallet />, index: '001' },
    { copy: managed, image: '/media/landing/agent_matched-clean.png', glyph: <GlyphAuction />, index: '002' },
  ];
  return (
    <Band tone="dark" panel="grow">
      <PanelContent><SectionTag tone="dark">{direct.tag} / {managed.tag}</SectionTag><h2 className="mt-6 font-sans text-[clamp(2rem,7vw,3rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.025em]">{pb.chooseHowDealStarts}</h2></PanelContent>
      <div className="mt-10 grid gap-6 lg:mt-14 lg:grid-cols-2">
        {cards.map(({ copy, image, glyph, index }, cardIndex) => (
          <motion.article
            key={copy.tag}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.16 }}
            transition={{ duration: dur.slow, ease: ease.out, delay: cardIndex * 0.08 }}
            className="overflow-hidden rounded-[22px] border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-raised)]"
          >
            <div className="flex min-h-[340px] min-w-0 flex-col px-5 py-8 sm:px-8 sm:py-10 lg:min-h-[360px] lg:px-10 lg:py-11">
              <PanelContent index={1}>
                <div className="flex items-center gap-2 text-[var(--lp-accent)]">
                  <span className="grid size-10 place-items-center rounded-[12px] border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-soft)]">{glyph}</span>
                  <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-workspace-muted)]">[:{index}]</span>
                </div>
                <SectionTag tone="dark">{copy.tag}</SectionTag>
                <h3 className="mt-5 max-w-[17ch] font-sans text-[clamp(1.8rem,3.5vw,3.2rem)] font-extrabold uppercase leading-[0.94] tracking-[-0.035em] text-[var(--lp-workspace-ink)]">
                  {copy.title}
                </h3>
                <p className="mt-5 max-w-[42ch] text-[15px] leading-[1.58] text-[var(--lp-workspace-muted)]">{copy.body}</p>
                <ul className="mt-8 divide-y divide-[var(--lp-workspace-border)] border-y border-[var(--lp-workspace-border)]">
                  {[
                    { title: copy.tile1Title, body: copy.tile1Body },
                    { title: copy.tile2Title, body: copy.tile2Body },
                  ].map((tile, tileIndex) => (
                    <li key={tile.title} className="grid gap-3 py-4 sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-5">
                      <span className="mono pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--lp-accent)]">[:{String(tileIndex + 1).padStart(3, '0')}]</span>
                      <p className="text-[13px] leading-[1.55] text-[var(--lp-workspace-muted)]"><strong className="text-[var(--lp-workspace-ink)]">{tile.title}.</strong>{' '}{tile.body}</p>
                    </li>
                  ))}
                </ul>
              </PanelContent>
            </div>
            <div className="relative h-[300px] overflow-hidden border-t border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-raised)] sm:h-[360px]">
              <PanelMedia travel={18} dim={0.86}>
                <img
                  src={image}
                  alt=""
                  className={cn(
                    'absolute inset-0 h-full w-full scale-[1.04] object-center',
                    image.includes('agent_matched') ? 'object-cover' : 'object-contain',
                  )}
                />
              </PanelMedia>
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,var(--lp-band-dark)_100%)]" aria-hidden="true" />
              <img src="/brand/karwan-mark-lime.png" alt="" aria-hidden className="absolute bottom-5 end-5 size-9 opacity-80 sm:bottom-7 sm:end-7" />
            </div>
          </motion.article>
        ))}
      </div>
    </Band>
  );
}

// Flow. deal end to end. Six stage chips on a hairline track + three KPIs
/// Compact "1.2M" / "412K" formatting for the KPI band. Returns value + unit
/// separately because KpiBlock renders them in different type sizes.
function compactUsdc(volume: number): { value: string; unit: string } {
  if (volume >= 1_000_000) return { value: (volume / 1_000_000).toFixed(2), unit: 'M USDC' };
  if (volume >= 1_000) return { value: (volume / 1_000).toFixed(1), unit: 'K USDC' };
  return { value: String(Math.round(volume)), unit: 'USDC' };
}

function FlowSection({ copy }: { copy: LandingCopy['flow'] }) {
  // Real platform numbers, not marketing copy: the same aggregate endpoint
  // the app itself uses. '—' until the fetch lands; a failed fetch just keeps
  // the placeholders (the landing must render without the API).
  const [stats, setStats] = useState<{
    settled: number;
    total: number;
    volumeUsdc: number;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .dealsStats()
      .then((r) => {
        if (alive) setStats({ settled: r.settled, total: r.total, volumeUsdc: r.volumeUsdc });
      })
      .catch(() => {
        /* placeholders stay */
      });
    return () => {
      alive = false;
    };
  }, []);
  const volume = stats ? compactUsdc(stats.volumeUsdc) : null;
  const reduce = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const timer = window.setInterval(() => setActiveStep((step) => (step + 1) % 6), 2600);
    return () => window.clearInterval(timer);
  }, [reduce]);

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
    <Band id="flow" tone="dark" panel="grow">
      <PanelContent className="flex items-end justify-between gap-6 flex-wrap mb-12">
        <div>
          <SectionTag tone="dark">{copy.tag}</SectionTag>
          <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(1.75rem,5.4vw,4.5rem)] max-w-[18ch]">
            {copy.title}
          </h2>
        </div>
        <p
          className="mono text-[12px] uppercase tracking-[0.08em] inline-flex items-center gap-2"
          style={{ color: '#E6E6E3' }}
        >
          <span
            aria-hidden
            className="inline-block w-[6px] h-[6px]"
            style={{ background: 'var(--lp-accent)', borderRadius: 1 }}
          />
          {copy.liveLabel}
        </p>
      </PanelContent>

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
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: dur.base, ease: ease.out, delay: i * 0.07 }}
                className="relative px-4 py-6"
                data-flow-active={activeStep === i ? 'true' : undefined}
                animate={reduce ? undefined : { opacity: activeStep === i ? 1 : 0.58, y: activeStep === i ? 0 : 2 }}
                style={{
                  boxShadow: activeStep === i ? 'inset 0 -2px 0 var(--lp-accent)' : undefined,
                  borderInlineEnd:
                    i < steps.length - 1 && (i + 1) % 6 !== 0
                      ? '1px solid var(--lp-border-subtle)'
                      : undefined,
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="mono text-[10px] tabular-nums uppercase tracking-[0.1em]"
                    style={{ color: '#E6E6E3' }}
                  >
                    [{String(i + 1).padStart(2, '0')}]
                  </span>
                  <FlowChip variant={s.state}>{s.tag}</FlowChip>
                </div>
                <p className="font-sans text-[15px] font-medium leading-tight text-[var(--lp-workspace-ink)]">
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
            <KpiBlock
              label={copy.kpis.dealsLabel}
              value={stats ? String(stats.total) : '—'}
              unit=""
            />
            <KpiBlock
              label={copy.kpis.settledLabel}
              value={stats ? String(stats.settled) : '—'}
              unit=""
            />
            <KpiBlock
              label={copy.kpis.volumeLabel}
              value={volume ? volume.value : '—'}
              unit={volume ? volume.unit : ''}
            />
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
  // These chips sit on dark, fixed landing bands even when the page theme is
  // light. Use the brighter semantic variants so the 9px labels still clear
  // WCAG contrast rather than inheriting the light-surface muted token.
  const c = variant === 'pos' ? 'var(--lp-accent)' : variant === 'warn' ? '#FFE7A3' : '#C5E2FF';
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
          style={{ color: 'var(--lp-workspace-muted)' }}
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
          className="font-sans font-bold tabular-nums tracking-[-0.025em] leading-none text-[var(--lp-workspace-ink)]"
          style={{ fontSize: 'clamp(36px, 4vw, 56px)' }}
        >
          {value}
        </span>
        <span
          className="mono text-[12px] uppercase tracking-[0.1em]"
          style={{ color: 'var(--lp-workspace-muted)' }}
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
    <Band tone="dark" panel="grow" className="!max-w-none !px-0 !py-0">
      <div className="relative isolate overflow-hidden border-y border-[var(--lp-workspace-border)]">
        <PanelMedia travel={30} dim={0.4}>
          <img src="/media/landing/africaa-map.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-center opacity-60" />
        </PanelMedia>
        <div className="absolute inset-0 bg-[#0a0a0b]/75" />
        <div className="relative mx-auto grid max-w-[1440px] items-center gap-8 px-[clamp(20px,5vw,72px)] py-[clamp(40px,9vw,132px)] lg:min-h-[680px] lg:gap-14 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
      <PanelContent className="flex items-end justify-between gap-6 flex-wrap mb-8 lg:mb-14">
        <div>
          <SectionTag tone="dark">{copy.tag}</SectionTag>
          <h2 className="mt-6 max-w-[12ch] font-sans text-[clamp(1.85rem,5.4vw,5rem)] font-extrabold uppercase leading-[0.92] tracking-[-0.035em] text-balance">
            {copy.titleStart}{' '}<span className="text-[var(--lp-accent)]">{copy.titleAccent}</span>{copy.titleEnd}
          </h2>
        </div>
      </PanelContent>

      <ul>
        {lanes.map((l, i) => (
          <motion.li
            key={l.id}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: dur.base, ease: ease.out, delay: i * 0.04 }}
            className="group grid gap-2 border-b border-[var(--lp-workspace-border)] py-5 sm:grid-cols-[100px_1fr_auto] sm:items-baseline sm:gap-6 sm:py-6"
            style={{
              borderTop: i === 0 ? '1px solid var(--lp-workspace-border)' : undefined,
            }}
          >
            <span
              className="mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--lp-workspace-muted)]"
            >
              [:{l.id}]
            </span>
            <span
              className="font-sans text-[clamp(1.25rem,2.4vw,2rem)] font-bold uppercase leading-tight tracking-[-0.025em] text-[var(--lp-workspace-ink)]"
            >
              {l.from}{' '}
              <span style={{ color: 'var(--lp-text-sub)' }} aria-label={copy.toAria}>
                →
              </span>{' '}
              {l.to}
            </span>
            <span
              className="flex items-center gap-3 mono text-[10px] uppercase tracking-[0.08em] text-[var(--lp-workspace-muted)] sm:justify-self-end sm:text-right"
            >
              <span className="tabular-nums">{l.vol} USDC</span>
              <span className="text-[var(--lp-workspace-faint)]">·</span>
              <span className="tabular-nums">{copy.avgPrefix} {l.avg}</span>
            </span>
          </motion.li>
        ))}
      </ul>
        </div>
      </div>
    </Band>
  );
}

// Early trades. modular cards grid (testimonial-style, big number visual)
function EarlyTradesSection({ copy }: { copy: LandingCopy['earlyTrades'] }) {
  /// Which card the rail is resting on, read from scroll position rather than
  /// tracked on click, so a swipe and a dot press agree.
  const railRef = useRef<HTMLDivElement>(null);
  const [railIndex, setRailIndex] = useState(0);
  const onRailScroll = () => {
    const el = railRef.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement | undefined;
    if (!first) return;
    // Card width plus the gap. Measured from the DOM because the card width is
    // a clamp of the viewport, not a constant.
    const second = el.children[1] as HTMLElement | undefined;
    const stride = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
    if (stride <= 0) return;
    setRailIndex(Math.round(el.scrollLeft / stride));
  };
  const scrollToCard = (index: number) => {
    const el = railRef.current;
    const target = el?.children[index] as HTMLElement | undefined;
    if (!el || !target) return;
    const base = (el.children[0] as HTMLElement).offsetLeft;
    el.scrollTo({
      left: target.offsetLeft - base,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

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
    <Band tone="dark" panel="grow">
      <PanelContent>
        <SectionTag tone="dark">{copy.tag}</SectionTag>
        <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(1.75rem,5.4vw,4.5rem)] max-w-[20ch]">
          {copy.title}
        </h2>
      </PanelContent>
      <div
        ref={railRef}
        onScroll={onRailScroll}
        className="mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:none] sm:grid sm:grid-cols-2 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, i) => (
          <PanelContent
            key={c.tag}
            index={i}
            hoverLift
            className="group relative flex min-w-full snap-start flex-col p-7 aspect-[4/5] sm:min-w-0"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--lp-border-subtle)',
              borderRadius: 14,
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <span
                className="mono text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'var(--lp-workspace-muted)' }}
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
                  className="font-sans font-bold tabular-nums tracking-[-0.03em] leading-none text-[var(--lp-workspace-ink)]"
                  style={{ fontSize: 'clamp(40px, 5vw, 64px)' }}
                >
                  {c.value}
                </span>
                <span
                  className="mono text-[12px] uppercase tracking-[0.1em]"
                  style={{ color: 'var(--lp-workspace-muted)' }}
                >
                  {c.unit}
                </span>
              </div>
              <p
                className="mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--lp-workspace-muted)' }}
              >
                {c.sub}
              </p>
            </div>

            <p className="mt-5 font-sans text-[18px] font-bold uppercase tracking-[-0.02em] leading-[1.1] text-[var(--lp-workspace-ink)]">
              {c.title}
            </p>
          </PanelContent>
        ))}
      </div>
      <RailDots count={cards.length} active={railIndex} onSelect={scrollToCard} />
    </Band>
  );
}

/// Position dots for a horizontal card rail.
///
/// The rail is a swipe on a phone and a grid from `sm` up, so the dots exist
/// only below that breakpoint: above it every card is already on screen and a
/// pager would be pointing at nothing. A peeking next card says "there is more
/// this way" but not how much more, which is what the dots add.
function RailDots({
  count,
  active,
  onSelect,
}: {
  count: number;
  active: number;
  onSelect: (index: number) => void;
}) {
  const pb = useTranslations().pageBits;
  if (count <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-2 sm:hidden">
      {Array.from({ length: count }, (_, index) => {
        const current = index === active;
        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={pb.railDotTemplate
              .replace('{n}', String(index + 1))
              .replace('{total}', String(count))}
            aria-current={current ? 'true' : undefined}
            // 44px tap target around a 7px dot: the dot is the mark, the button
            // is the thing a thumb can actually hit.
            className="grid h-11 w-11 place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            <span
              aria-hidden
              className="block rounded-full transition-[width,background-color,opacity] duration-[var(--dur-base)]"
              style={{
                width: current ? 18 : 7,
                height: 7,
                background: current ? 'var(--lp-accent)' : 'rgba(255,255,255,0.32)',
              }}
            />
          </button>
        );
      })}
    </div>
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
    <Band id="get-started" tone="light" panel="grow" className="!max-w-none !px-0 !py-0">
      <div className="relative isolate overflow-hidden border-y border-black/10">
        <div className="relative mx-auto max-w-[1080px] px-[clamp(20px,5vw,72px)] py-[clamp(36px,9vw,132px)]">
       <div className="relative z-10">
       <PanelContent>
        <SectionTag>{copy.tag}</SectionTag>
        <h2 className="mt-6 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance text-[clamp(1.75rem,5.4vw,4.5rem)] max-w-[18ch]">
          {copy.title}
        </h2>
      </PanelContent>

      <ul className="mt-8 lg:mt-0">
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
                      className="text-[15px] leading-[1.65] pb-7 max-w-[60ch] ms-0 sm:ms-[100px]"
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
       </div>
         </div>
      </div>
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
  panel,
}: {
  id?: string;
  tone: 'dark' | 'light';
  children: ReactNode;
  className?: string;
  compact?: boolean;
  overlay?: ReactNode;
  /// Makes this row a panel: one screen tall on a phone, snap-aligned, and the
  /// source of the active/quiet state its content animates on. `'grow'` keeps
  /// the floor but drops the ceiling for rows that are honestly taller than a
  /// screen, so nothing is clipped to make the geometry work.
  panel?: boolean | 'grow';
}) {
  const dark = tone === 'dark';
  const ref = useRef<HTMLElement>(null);
  const isPanel = useIsPanelViewport();
  const active = usePanelFilling(ref, isPanel && Boolean(panel));
  return (
    <PanelActiveProvider active={active}>
    <section
      ref={ref}
      id={id}
      data-panel={active ? 'active' : undefined}
      style={dark ? LANDING_DARK_VARS : undefined}
      className={cn(
        'relative left-1/2 w-bleed -translate-x-1/2 overflow-hidden scroll-mt-24',
        panel && 'lp-panel',
        panel === 'grow' && 'lp-panel-grow',
        dark
          ? 'bg-[var(--lp-band-dark)] text-white'
          : 'bg-[var(--lp-light)] text-[var(--lp-dark)]',
      )}
    >
      {overlay}
      <div
        className={cn(
          'relative mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)]',
          compact ? 'py-[clamp(28px,4vw,48px)]' : 'py-[clamp(40px,6vw,88px)]',
          className,
        )}
      >
        {children}
      </div>
    </section>
    </PanelActiveProvider>
  );
}

/* ---- motion helpers ---- */

// The cue at the foot of a row. Says there is another row under this one, and
// pressing it goes there: on a phone that is the only way to advance a whole row
// from the keyboard, and it is the affordance a first-time visitor looks for
// before they think to swipe.
function NextRowCue({ label }: { label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Pinned to the bottom of the hero, so it would otherwise slide under the
  // sticky strip and clip mid-glyph. Fade it over the first stretch of scroll,
  // with a dead zone up front so the slightest nudge does not kill it.
  const { scrollY } = useScroll();
  const scrollFade = useTransform(scrollY, [0, 48, 200], [1, 1, 0]);
  return (
    <motion.div ref={ref} style={{ opacity: scrollFade }}>
      <PanelAdvance label={label} onAdvance={() => advanceToNextPanel(ref.current)} />
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
        tone === 'dark' ? 'text-[var(--lp-workspace-muted)]' : 'text-[var(--lp-text-sub)]',
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
            ? 'focus-visible:ring-offset-[var(--lp-workspace-band)]'
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
          ? 'border border-[var(--lp-workspace-border)] text-[var(--lp-workspace-ink)] hover:border-[var(--lp-workspace-ink)] focus-visible:ring-offset-[var(--lp-workspace-band)]'
          : 'border border-[var(--lp-outline-strong)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-hover)] focus-visible:ring-offset-[var(--lp-light)]',
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
          tone === 'dark' ? 'text-[var(--lp-workspace-muted)]' : 'text-[var(--lp-text-sub)]',
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
