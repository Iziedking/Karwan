'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { DOCS_SECTIONS, useDocsSectionLabel } from './DocsSidebar';
import { DocsH2 } from './Prose';
import { RoadmapTimeline } from './RoadmapTimeline';
import styles from './ProductOverview.module.css';

const TESTNET_START = 'https://testnet.karwan.site/start?mode=signup';

export function ProductOverview() {
  const t = useTranslations().docsProduct;
  return (
    <article className="@container">
      <Hero />
      <section className="border-t border-[var(--lp-border-light)] pt-12">
        <DocsH2 id="problem">{t.problem.title}</DocsH2>
        <p className="mt-4 max-w-[64ch] text-[17px] leading-relaxed text-[var(--lp-text-sub)]">{t.problem.body}</p>
      </section>
      <HowItWorks />
      <Why />
      <Today />
      <section className="mt-16 border-t border-[var(--lp-border-light)] pt-12">
        <DocsH2 id="roadmap">{t.roadmap.title}</DocsH2>
        <p className="mt-3 max-w-[64ch] text-[15px] text-[var(--lp-text-sub)]">{t.roadmap.lede}</p>
        <RoadmapTimeline />
      </section>
      <Cta />
      <Explore />
    </article>
  );
}

function Hero() {
  const t = useTranslations().docsProduct.hero;
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className="relative flex min-h-[calc(100svh-var(--lp-nav-h,68px)-96px)] flex-col justify-center pb-24">
      <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.eyebrow}</p>
      <h1 className="mt-4 max-w-[20ch] font-sans text-[clamp(2.3rem,4.6vw,4.1rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-[var(--lp-dark)]">
        {t.title}
      </h1>
      <p className="mt-6 max-w-[58ch] text-[18px] leading-relaxed text-[var(--lp-text-sub)]">{t.lede}</p>
      <ul className="mt-7 flex flex-wrap gap-2">
        <li className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--lp-border-light)] px-3.5 text-[13px] font-semibold text-[var(--lp-dark)]">
          <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--lp-accent)]" />
          {t.testnet}
        </li>
        <li className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--lp-border-light)] px-3.5 text-[13px] font-semibold text-[var(--lp-dark)]">
          <span aria-hidden className="h-2 w-2 rounded-full border-2 border-[var(--lp-dark)]" />
          {t.mainnet}
        </li>
      </ul>
      <div className="mt-9 flex flex-wrap gap-3">
        <Link href="/start" className="inline-flex min-h-[52px] items-center rounded-[12px] bg-[var(--lp-accent)] px-6 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">
          {t.primary}
        </Link>
        <a href="#how" className="inline-flex min-h-[52px] items-center rounded-[12px] border border-[var(--lp-outline-strong)] px-6 text-[15px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
          {t.secondary}
        </a>
      </div>
      <a
        href="#problem"
        className={cn(styles.cue, 'absolute bottom-6 start-0 inline-flex min-h-11 items-center gap-3 text-[13px] font-semibold text-[var(--lp-text-sub)] transition-opacity duration-300', scrolled && 'pointer-events-none opacity-0')}
        aria-hidden={scrolled}
        tabIndex={scrolled ? -1 : 0}
      >
        <span className={styles.track}>
          <span className={styles.dot} />
        </span>
        {t.scroll}
      </a>
    </header>
  );
}

function HowItWorks() {
  const t = useTranslations().docsProduct.how;
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLLIElement | null>>([]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.55;
      let next = 0;
      refs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top < line) next = i;
      });
      setActive(next);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <section className="mt-16 border-t border-[var(--lp-border-light)] pt-12">
      <DocsH2 id="how">{t.title}</DocsH2>
      <p className="mt-3 max-w-[64ch] text-[15px] text-[var(--lp-text-sub)]">{t.lede}</p>
      <div className="mt-10 grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,320px)] @3xl:gap-12">
        <div className="sticky top-[calc(var(--lp-nav-h,68px)+10px)] z-10 self-start @3xl:hidden">
          <DealStrip active={active} />
        </div>
        <ol className="space-y-6 @3xl:space-y-[28vh] @3xl:pb-[18vh]">
          {t.steps.map((step, i) => (
            <li
              key={step.title}
              data-step={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className={cn('grid grid-cols-[40px_1fr] gap-x-4 transition-opacity duration-300', active === i ? 'opacity-100' : '@3xl:opacity-45')}
            >
              <span className={cn('mono flex h-10 w-10 items-center justify-center rounded-full border text-[15px] font-semibold', active >= i ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]' : 'border-[var(--lp-outline-strong)] text-[var(--lp-text-sub)]')}>
                {i + 1}
              </span>
              <div>
                <h3 className="mt-1.5 text-[20px] font-bold tracking-[-0.015em] text-[var(--lp-dark)]">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="hidden @3xl:block">
          <div className="sticky top-[calc(50vh-150px)]">
            <DealCard active={active} />
          </div>
        </div>
      </div>
    </section>
  );
}

function DealCard({ active }: { active: number }) {
  const card = useTranslations().docsProduct.how.card;
  const paid = active === 3;
  return (
    <div aria-hidden className="rounded-[18px] border border-[var(--lp-outline-strong)] bg-[var(--lp-card)] p-6 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.35)]">
      <p className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{card.label}</p>
      <p className="mt-2 text-[18px] font-bold text-[var(--lp-dark)]">{card.title}</p>
      <p className="mono mt-4 text-[44px] font-bold leading-none tracking-[-0.03em] text-[var(--lp-dark)]">
        150 <span className="text-[16px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
      </p>
      <p className="mt-3 text-[13px] text-[var(--lp-text-sub)]">{card.parties}</p>
      <div className="mt-6 grid grid-cols-4 gap-1.5">
        {card.states.map((s, i) => (
          <span
            key={s}
            className={cn('h-1.5 rounded-full transition-colors duration-300', i <= active ? (paid ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-dark)]') : 'bg-[var(--lp-border-light)]')}
          />
        ))}
      </div>
      <p className="mt-3 text-[15px] font-semibold text-[var(--lp-dark)]">{card.states[active]}</p>
    </div>
  );
}

function DealStrip({ active }: { active: number }) {
  const card = useTranslations().docsProduct.how.card;
  const paid = active === 3;
  return (
    <div aria-hidden className="rounded-[14px] border border-[var(--lp-outline-strong)] bg-[var(--lp-card)] px-4 py-3 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.4)]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[14px] font-semibold text-[var(--lp-dark)]">{card.title}</span>
        <span className="mono shrink-0 text-[15px] font-bold text-[var(--lp-dark)]">150 USDC</span>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1">
        {card.states.map((s, i) => (
          <span key={s} className={cn('h-1 rounded-full transition-colors duration-300', i <= active ? (paid ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-dark)]') : 'bg-[var(--lp-border-light)]')} />
        ))}
      </div>
      <p className="mt-1.5 text-[13px] font-semibold text-[var(--lp-dark)]">{card.states[active]}</p>
    </div>
  );
}

function Why() {
  const t = useTranslations().docsProduct;
  return (
    <section className="mt-16 border-t border-[var(--lp-border-light)] pt-12">
      <DocsH2 id="why">{t.why.title}</DocsH2>
      <p className="mt-3 max-w-[64ch] text-[15px] text-[var(--lp-text-sub)]">{t.why.lede}</p>
      <dl className="mt-8 grid gap-4 @xl:grid-cols-3">
        {[
          [t.facts.fee, t.facts.feeValue],
          [t.facts.confirm, t.facts.confirmValue],
          [t.facts.token, t.facts.tokenValue],
        ].map(([k, v]) => (
          <div key={k} className="border-t-2 border-[var(--lp-dark)] pt-3">
            <dt className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{k}</dt>
            <dd className="mt-1 text-[17px] font-bold leading-snug text-[var(--lp-dark)]">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[13px] text-[var(--lp-text-sub)]">{t.facts.note}</p>
      <ul className="mt-10 grid gap-x-10 @xl:grid-cols-2">
        {t.why.reasons.map((r) => (
          <li key={r.title} className="border-t border-[var(--lp-border-light)] py-6">
            <h3 className="text-[17px] font-bold tracking-[-0.01em] text-[var(--lp-dark)]">{r.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{r.body}</p>
          </li>
        ))}
      </ul>
      <Link href="/activity/all-time" className="mt-2 inline-flex min-h-11 items-center text-[15px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
        {t.why.numbersLink}
      </Link>
    </section>
  );
}

function StatusChip({ status }: { status: 'live' | 'invite' | 'planned' }) {
  const label = useTranslations().docsProduct.today.status[status];
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--lp-dark)]">
      <span
        aria-hidden
        className={cn(
          'h-2 w-2 rounded-full',
          status === 'live' && 'bg-[var(--lp-accent)]',
          status === 'invite' && 'border-2 border-[var(--lp-dark)]',
          status === 'planned' && 'bg-[var(--lp-border-light)]',
        )}
      />
      <span className={status === 'planned' ? 'text-[var(--lp-text-sub)]' : undefined}>{label}</span>
    </span>
  );
}

function Today() {
  const t = useTranslations().docsProduct.today;
  return (
    <section className="mt-16 border-t border-[var(--lp-border-light)] pt-12">
      <DocsH2 id="today">{t.title}</DocsH2>
      <p className="mt-3 max-w-[64ch] text-[15px] text-[var(--lp-text-sub)]">{t.lede}</p>
      <div className="mt-8 max-w-[760px]" role="table" aria-label={t.title}>
        <div role="row" className="hidden grid-cols-[minmax(0,1fr)_140px_140px] gap-4 border-b border-[var(--lp-outline-strong)] pb-3 @xl:grid">
          <span role="columnheader" className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.feature}</span>
          <span role="columnheader" className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.testnet}</span>
          <span role="columnheader" className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.mainnet}</span>
        </div>
        {t.rows.map((row) => (
          <div key={row.feature} role="row" className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-[var(--lp-border-light)] py-4 @xl:grid-cols-[minmax(0,1fr)_140px_140px] @xl:items-center">
            <span role="cell" className="col-span-2 text-[15px] font-semibold text-[var(--lp-dark)] @xl:col-span-1">{row.feature}</span>
            <span role="cell" className="flex flex-col gap-0.5">
              <span className="text-[12px] text-[var(--lp-text-sub)] @xl:hidden">{t.testnet}</span>
              <StatusChip status={row.testnet} />
            </span>
            <span role="cell" className="flex flex-col gap-0.5">
              <span className="text-[12px] text-[var(--lp-text-sub)] @xl:hidden">{t.mainnet}</span>
              <StatusChip status={row.mainnet} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Cta() {
  const t = useTranslations().docsProduct.cta;
  return (
    <section className="mt-16 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-band-dark,#10171D)] px-[clamp(24px,5vw,56px)] py-[clamp(36px,6vw,64px)] text-[#F4F6F8]">
      <h2 className="max-w-[20ch] text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">{t.title}</h2>
      <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-[#C5CDD5]">{t.body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/start" className="inline-flex min-h-[52px] items-center rounded-[12px] bg-[var(--lp-accent)] px-6 text-[15px] font-semibold text-[#10171D] hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          {t.primary}
        </Link>
        <a href={TESTNET_START} className="inline-flex min-h-[52px] items-center rounded-[12px] border border-white/35 px-6 text-[15px] font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
          {t.secondary}
        </a>
      </div>
    </section>
  );
}

function Explore() {
  const m = useTranslations();
  const labelFor = useDocsSectionLabel();
  const sections = DOCS_SECTIONS.filter((s) => s.key !== 'overview');
  return (
    <section className="mt-16 border-t border-[var(--lp-border-light)] pt-12">
      <DocsH2 id="explore">{m.docsProduct.explore.title}</DocsH2>
      <ul className="mt-6 grid gap-x-10 @xl:grid-cols-2">
        {sections.map((s) => (
          <li key={s.href} className="border-t border-[var(--lp-border-light)]">
            <Link href={s.href} className="group flex min-h-[72px] items-center justify-between gap-4 py-4">
              <span>
                <span className="block text-[16px] font-bold text-[var(--lp-dark)]">{labelFor(s.key)}</span>
                <span className="mt-1 block text-[14px] text-[var(--lp-text-sub)]">
                  {s.key === 'escrow' ? m.docsEscrowPage.nav.blurb : m.docsShell.sidebar.sections[s.key].blurb}
                </span>
              </span>
              <span aria-hidden className="text-[var(--lp-text-sub)] transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
