'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type TrendingCategory, type UpdateCard } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';

const GAP = 12;
const ADVANCE_MS = 6000;

/// Home Updates: published cards about the tech Karwan runs on, market news and
/// what people are asking for. A native scroll strip with snap, so touch and
/// trackpads swipe with real momentum; buttons, dots, arrow keys and a mouse
/// drag move it too. It advances on its own until the reader hovers, focuses
/// or touches it, and not at all under reduced motion.
export function UpdatesCarousel() {
  const t = useTranslations().accountHome;
  const updates = useQuery({ queryKey: ['home-updates'], queryFn: () => api.getUpdates(), staleTime: 60_000 });
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [held, setHeld] = useState(false);
  const [taken, setTaken] = useState(false);
  const cards = updates.data?.cards ?? [];

  const step = useCallback(() => {
    const first = track.current?.firstElementChild as HTMLElement | null;
    return first ? first.offsetWidth + GAP : 1;
  }, []);

  const sync = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // RTL scrolls negative; the position is the same distance either way.
    const left = Math.abs(el.scrollLeft);
    setActive(Math.min(cards.length - 1, Math.round(left / step())));
    setAtEnd(left + el.clientWidth >= el.scrollWidth - 4);
  }, [cards.length, step]);

  useEffect(() => {
    sync();
    const onResize = () => sync();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sync]);

  const go = useCallback((index: number) => {
    const el = track.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(cards.length - 1, index));
    const dir = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: dir * clamped * step(), behavior: reduce ? 'auto' : 'smooth' });
  }, [cards.length, step]);

  useEffect(() => {
    const el = track.current;
    if (held || taken || cards.length < 2 || !el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => {
      if (document.hidden || el.scrollWidth <= el.clientWidth + 4) return;
      go(atEnd ? 0 : active + 1);
    }, ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, atEnd, held, taken, cards.length, go]);

  if (cards.length === 0) return null;

  // A mouse drags the strip like a finger. Touch and pens already scroll
  // natively, so only the mouse is handled here.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !track.current) return;
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !track.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 5) d.moved = true;
    if (d.moved) track.current.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) go(Math.round(Math.abs(track.current?.scrollLeft ?? 0) / step()));
    // Let the click that ends a drag through only when the pointer barely moved.
    if (d?.moved) window.addEventListener('click', swallow, { capture: true, once: true });
  };

  const arrow = (enabled: boolean) => cn(
    'grid size-10 place-items-center rounded-full border border-[var(--lp-border-light)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] sm:size-11',
    enabled ? 'bg-[var(--lp-card)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]' : 'cursor-default text-[var(--lp-text-muted)]',
  );

  return (
    <section
      aria-labelledby="home-updates-title"
      aria-roledescription="carousel"
      className="mt-7"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
      onPointerDown={(e) => { if (e.pointerType !== 'mouse') setTaken(true); }}
      onWheel={() => setTaken(true)}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-updates-title" className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)] sm:text-[20px]">{t.updatesTitle}</h2>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center sm:flex">
            {cards.map((card, i) => (
              <button key={card.id} type="button" onClick={() => go(i)} aria-label={t.updatesShow.replace('{n}', String(i + 1))} aria-current={i === active ? 'true' : undefined} className="grid size-6 place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rounded-full">
                <span className={cn('block h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none', i === active ? 'w-5 bg-[var(--lp-dark)]' : 'w-1.5 bg-[var(--lp-border)]')} />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label={t.updatesPrev} className={arrow(active > 0)}>
            <Chevron dir="prev" />
          </button>
          <button type="button" onClick={() => go(active + 1)} disabled={atEnd} aria-label={t.updatesNext} className={arrow(!atEnd)}>
            <Chevron dir="next" />
          </button>
        </div>
      </div>

      <div
        ref={track}
        onScroll={sync}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); go(active + (getComputedStyle(e.currentTarget).direction === 'rtl' ? -1 : 1)); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(active + (getComputedStyle(e.currentTarget).direction === 'rtl' ? 1 : -1)); }
        }}
        className="updates-track -me-4 mt-3 flex snap-x snap-mandatory overflow-x-auto pe-4 sm:-me-6 sm:pe-6"
        style={{ gap: GAP }}
      >
        {cards.map((card, i) => (
          <UpdateTile key={card.id} card={card} trending={updates.data?.trending ?? []} index={i} total={cards.length} />
        ))}
      </div>

      <div className="mt-2 flex justify-center sm:hidden" aria-hidden>
        {cards.map((card, i) => (
          <span key={card.id} className="grid size-5 place-items-center">
            <span className={cn('block h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none', i === active ? 'w-5 bg-[var(--lp-dark)]' : 'w-1.5 bg-[var(--lp-border)]')} />
          </span>
        ))}
      </div>
    </section>
  );
}

function swallow(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}

export function UpdateTile({ card, trending, index, total }: { card: UpdateCard; trending: TrendingCategory[]; index: number; total: number }) {
  const t = useTranslations().accountHome;
  const external = card.href.startsWith('https://');
  const vars = {
    '--g': `var(--update-${card.ground})`,
    '--g-deep': `var(--update-${card.ground}-deep)`,
    '--g-ring': `var(--update-${card.ground}-ring)`,
  } as CSSProperties;
  const body: ReactNode = card.kind === 'trending'
    ? trending.length > 0
      ? (
        // One line of chips: a chip that does not fit is hidden rather than
        // wrapping and pushing the button off the card.
        <span className="mt-2 flex h-[26px] flex-wrap gap-1.5 overflow-hidden">
          {trending.map((item) => (
            <span
              key={item.name}
              aria-label={`${item.name}, ${item.requests === 1 ? t.trendingCountOne : t.trendingCount.replace('{n}', String(item.requests))}`}
              className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--lp-card)]/80 px-2.5 text-[12px] font-medium text-[var(--lp-dark)]"
            >
              <span aria-hidden>{item.name}</span>
              <span aria-hidden className="tabular-nums text-[var(--lp-text-sub)]">{item.requests}</span>
            </span>
          ))}
        </span>
      )
      : <span className="mt-1.5 block text-[12.5px] leading-snug text-[var(--lp-text-sub)] sm:text-[13.5px]">{t.trendingEmpty}</span>
    : card.body
      ? <span className="mt-1.5 block text-[12.5px] leading-snug text-[var(--lp-text-sub)] sm:text-[13.5px]">{card.body}</span>
      : null;
  const content = (
    <>
      <span aria-hidden className={`update-art update-art-${card.art} pointer-events-none absolute inset-0`}>
        <span /><span /><span /><span />
      </span>
      <span className="relative self-start rounded-full bg-[var(--lp-card)]/75 px-2.5 py-1 text-[11px] font-semibold text-[var(--lp-text-sub)] sm:text-[12px]">{card.tag}</span>
      <span className="relative block max-w-[70%]">
        <span className="block text-[22px] font-light leading-[1.1] tracking-[-0.02em] text-[var(--lp-dark)] sm:text-[28px]">{card.title}</span>
        {body}
      </span>
      <span className="relative inline-flex items-center gap-1.5 self-start rounded-full bg-[var(--lp-dark)] px-3 py-1.5 text-[12px] font-semibold text-[var(--lp-card)] sm:text-[13px]">
        {card.kind === 'video' ? <PlayIcon /> : null}
        {card.ctaLabel}
        {external ? <span className="sr-only">, {t.opensNewTab}</span> : null}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
      </span>
    </>
  );
  const className = 'update-card group relative flex h-[184px] w-[min(300px,82vw)] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[22px] border border-[var(--lp-border-light)] p-4 transition-transform duration-300 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:h-[232px] sm:w-[400px] sm:rounded-[26px] sm:p-6';
  const label = `${index + 1} / ${total}: ${card.title}`;
  return external ? (
    <a href={card.href} target="_blank" rel="noopener noreferrer" aria-roledescription="slide" aria-label={label} className={className} style={vars} draggable={false}>
      {content}
    </a>
  ) : (
    <Link href={card.href} aria-roledescription="slide" aria-label={label} className={className} style={vars} draggable={false}>
      {content}
    </Link>
  );
}

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100">
      <path d={dir === 'prev' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
  );
}
