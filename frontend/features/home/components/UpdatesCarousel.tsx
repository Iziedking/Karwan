'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type TrendingCategory, type UpdateCard } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { localizeSeedCard } from '../seedUpdates';
import { cn } from '@/shared/utils/cn';
import { photoSrc } from '@/features/listings/photos';

/// Home Updates: published media tiles about the tech Karwan runs on, market
/// news, videos and what people are asking for. Three fit the column on a wide
/// screen; more scroll in a native snap strip that the arrows page through. It
/// never moves on its own.
export function UpdatesCarousel() {
  const t = useTranslations().accountHome;
  const updates = useQuery({ queryKey: ['home-updates'], queryFn: () => api.getUpdates(), staleTime: 60_000 });
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const cards = updates.data?.cards ?? [];

  const sync = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // RTL scrolls negative; the distance travelled is the same either way.
    const left = Math.abs(el.scrollLeft);
    setEdges({ start: left <= 4, end: left + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sync, cards.length]);

  /// Moves by what is on screen, so a wide screen pages three tiles at a time.
  const page = useCallback((by: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    const dir = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * by * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
  }, []);

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
    // The click that ends a drag must not open the tile under the pointer.
    if (d?.moved) window.addEventListener('click', swallow, { capture: true, once: true });
  };

  const scrolls = !(edges.start && edges.end);
  const arrow = (enabled: boolean) => cn(
    'grid size-11 place-items-center rounded-full border border-[var(--lp-border-light)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
    enabled ? 'bg-[var(--lp-card)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]' : 'cursor-default text-[var(--lp-text-muted)]',
  );

  return (
    <section aria-labelledby="home-updates-title" aria-roledescription="carousel" className="mt-7">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id="home-updates-title" className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t.updatesTitle}</h2>
        {scrolls ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => page(-1)} disabled={edges.start} aria-label={t.updatesPrev} className={arrow(!edges.start)}>
              <Chevron dir="prev" />
            </button>
            <button type="button" onClick={() => page(1)} disabled={edges.end} aria-label={t.updatesNext} className={arrow(!edges.end)}>
              <Chevron dir="next" />
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={track}
        onScroll={sync}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onKeyDown={(e) => {
          const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
          if (e.key === 'ArrowRight') { e.preventDefault(); page(rtl ? -1 : 1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); page(rtl ? 1 : -1); }
        }}
        className="updates-track -me-4 mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto pe-4 sm:-me-6 sm:pe-6 lg:me-0 lg:gap-6 lg:pe-0"
      >
        {cards.map((card, i) => (
          <UpdateTile key={card.id} card={card} trending={updates.data?.trending ?? []} index={i} total={cards.length} />
        ))}
      </div>
    </section>
  );
}

function swallow(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}

/// 116 seconds reads 1:56.
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}

export function UpdateTile({ card: raw, trending, index, total }: { card: UpdateCard; trending: TrendingCategory[]; index: number; total: number }) {
  const t = useTranslations().accountHome;
  const { locale } = useLocale();
  const card = localizeSeedCard(raw, locale);
  const external = card.href.startsWith('https://');
  const ground = { '--g': `var(--update-${card.ground})`, '--g-deep': `var(--update-${card.ground}-deep)` } as CSSProperties;
  const video = card.kind === 'video';
  // A post without a picture sets its short text large in the media slot, so
  // it is said once, up there, and not again under the title.
  const bodyInMedia = card.kind === 'post' && !card.image && Boolean(card.body);

  let media: ReactNode;
  if (card.image) {
    media = (
      <>
        <img src={card.image.startsWith('/api/') ? photoSrc(card.image) : card.image} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
        {video ? (
          <span className="absolute bottom-3 start-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--lp-dark)] px-3 text-[14px] font-semibold tabular-nums text-[var(--lp-card)]">
            <PlayIcon />
            {card.videoSeconds ? clock(card.videoSeconds) : card.ctaLabel}
          </span>
        ) : null}
      </>
    );
  } else if (card.kind === 'trending') {
    const top = Math.max(1, ...trending.map((item) => item.requests));
    media = trending.length > 0 ? (
      <ul className="flex size-full flex-col justify-center gap-3 px-5" aria-label={card.title}>
        {trending.map((item) => (
          <li key={item.name} className="grid grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto] items-center gap-3">
            <span className="truncate text-[14px] font-semibold text-[var(--lp-dark)]">{item.name}</span>
            <span aria-hidden className="h-2 rounded-full bg-[var(--g-deep)]">
              <span className="block h-full rounded-full bg-[var(--lp-dark)]" style={{ width: `${Math.round((item.requests / top) * 100)}%` }} />
            </span>
            <span className="text-[14px] font-medium tabular-nums text-[var(--lp-text-sub)]">
              <span aria-hidden>{item.requests}</span>
              <span className="sr-only">{item.requests === 1 ? t.trendingCountOne : t.trendingCount.replace('{n}', String(item.requests))}</span>
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <span className="flex size-full items-center px-5 text-[15px] font-medium leading-snug text-[var(--lp-text-sub)]">{t.trendingEmpty}</span>
    );
  } else if (video) {
    media = (
      <span className="grid size-full place-items-center">
        <span className="grid size-14 place-items-center rounded-full bg-[var(--lp-dark)] text-[var(--lp-card)]"><PlayIcon size={18} /></span>
      </span>
    );
  } else {
    media = bodyInMedia ? (
      <span dir="auto" className="flex size-full items-end p-5 text-[19px] font-semibold leading-[1.25] tracking-[-0.015em] text-[var(--lp-dark)]">
        <span className="line-clamp-4">{card.body}</span>
      </span>
    ) : null;
  }

  const content = (
    <>
      <span className="relative block h-[180px] overflow-hidden bg-[var(--g)] sm:h-[212px]">{media}</span>
      <span className="flex flex-1 flex-col p-4 sm:p-5">
        <span className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{card.tag}</span>
        <span dir="auto" className="mt-1 line-clamp-2 text-[18px] font-semibold leading-snug tracking-[-0.015em] text-[var(--lp-dark)]">{card.title}</span>
        {card.body && !bodyInMedia && card.kind !== 'trending' ? (
          <span dir="auto" className="mt-1 line-clamp-1 text-[15px] font-medium text-[var(--lp-text-sub)]">{card.body}</span>
        ) : null}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[14px] font-bold text-[var(--lp-dark)]">
          {card.ctaLabel}
          {external ? <span className="sr-only">, {t.opensNewTab}</span> : null}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100 motion-reduce:transition-none">
            {external ? <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></> : <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>}
          </svg>
        </span>
      </span>
    </>
  );
  const className = 'update-card group flex w-[min(320px,80vw)] shrink-0 snap-start flex-col overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] transition-colors duration-200 hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] sm:w-[calc((100%-16px)/2)] lg:w-[calc((100%-48px)/3)]';
  const label = `${index + 1} / ${total}: ${card.title}`;
  return external ? (
    <a href={card.href} target="_blank" rel="noopener noreferrer" aria-roledescription="slide" aria-label={label} className={className} style={ground} draggable={false}>
      {content}
    </a>
  ) : (
    <Link href={card.href} aria-roledescription="slide" aria-label={label} className={className} style={ground} draggable={false}>
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

function PlayIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
  );
}
