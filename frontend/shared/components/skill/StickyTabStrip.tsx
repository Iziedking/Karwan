'use client';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { dur, ease } from '@/shared/motion/tokens';
import { ActionBeacon } from '@/shared/components/ActionBeacon';

/// SKILL.md §4.5. The sticky section tab strip. Equal columns, mono labels,
/// right-aligned chevron in each cell. Active cell has a top 2px lime indicator
/// animated with shared `layoutId` so it SLIDES between tabs (never fades in
/// place). Sticks below the main nav with a subtle backdrop blur on scroll.
///
/// Pattern per page (from skill §4.5):
///   /home:    [:OVERVIEW] [:HOW IT WORKS] [:FLOW] [:GET STARTED]
///   /buyer:   [:OPEN ORDERS] [:IN ESCROW] [:DISPUTES] [:HISTORY]
///   /seller:  [:JOBS] [:MILESTONES] [:PAYOUTS] [:RATINGS]
///   /market:  [:LANES] [:RATES] [:LIQUIDITY] [:PARTNERS]
///   /Activity: [:LIVE] [:SETTLEMENTS] [:NOTIFICATIONS] [:AUDIT]
///   /profile: [:IDENTITY] [:WALLETS] [:AGENTS] [:PREFERENCES]

export interface Tab {
  id: string;
  label: string;
  hash?: string;   // anchor target for scroll-to-section behavior
  count?: number;
  attention?: boolean;
}

const LAYOUT_ID = 'skill-tab-strip-indicator';

/// TopNav owns the top of the viewport (`sticky top-0 z-30`, see
/// shared/components/TopNav.tsx). The tab strip docks immediately below it
/// so the two stack instead of fighting for the same `top: 0` slot,
/// without this anchor the strip slid behind the TopNav and read as
/// "vanishing on scroll" to the user. The bar publishes its measured height as
/// `--lp-nav-h`; the literal is only the fallback for the first frame.
const TOPNAV_OFFSET = 'var(--lp-nav-h, 68px)';

/// Mobile shows two tabs and a sliver of the third. Three signals tell the user
/// the rest of the set exists and is reachable, none of them a sentence of copy:
///   1. the position rail under the row: a thumb one panel wide on a track the
///      width of the set, which says how many panels there are and which is
///      open, and slides every time that changes,
///   2. the edge pagers, which only exist while there is something past them,
///   3. a one-time peek: the row slides out and back the first time the strip
///      is on screen, so the movement itself is the instruction.
/// Without these the strip read as two static tabs and people never found
/// AGENTS or PREFERENCES.
const PAD_START = 'clamp(16px, 4vw, 56px)';
const PAD_END = 'max(clamp(16px, 4vw, 56px), 32px)';
const PEEK_PX = 28;
const PEEK_MS = 1000;
const PEEK_DELAY_MS = 850;
const NUDGE_KEY = 'karwan.tabstrip.peeked';

export function StickyTabStrip({
  tabs,
  active,
  onChange,
  className,
  onDark = true,
  contentMaxWidth = 1320,
}: {
  tabs: Tab[];
  active: string;
  onChange?: (id: string) => void;
  className?: string;
  onDark?: boolean;
  /// Reading measure of the tab row, in px. Defaults to the wide page measure.
  /// Pass the width of the content below when that content is narrower, so the
  /// strip and the thing it drives share an edge instead of the strip overhanging
  /// it by a couple of hundred pixels.
  contentMaxWidth?: number;
}) {
  const a11y = useTranslations().a11y;
  // Backdrop blur kicks in once the strip is past the top nav.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    function onScroll() {
      setStuck(window.scrollY > 80);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const reduced = useReducedMotion();
  const slide = { duration: reduced ? 0 : dur.base, ease: ease.out };

  const navRef = useRef<HTMLElement>(null);

  /// The strip is the second half of the sticky chrome, and the landing sizes
  /// its rows against both halves (globals.css, "Landing panels"). Measured
  /// rather than assumed: the row wraps to two lines in locales with longer
  /// labels, and the mobile position rail is only there below `md`.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty(
        '--lp-strip-h',
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--lp-strip-h');
    };
  }, []);

  const listRef = useRef<HTMLUListElement>(null);
  const tabKey = tabs.map((t) => t.id).join(',');

  /// Which directions still have tabs hidden past the edge. Drives the pagers:
  /// an arrow that never disappears teaches nothing, one that appears exactly
  /// when there is more to see is the affordance.
  const [reach, setReach] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setReach({ start: el.scrollLeft > 4, end: max > 4 && el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [measure, tabKey]);

  /// Selecting a tab that sits off-screen (deep link, assistant hand-off, the
  /// pager) has to bring it into view or the strip looks like it ignored the
  /// click. Only on a real change of `active`, so a parent re-render never
  /// yanks the row back while someone is mid-swipe.
  const lastActive = useRef<string | null>(null);
  useEffect(() => {
    if (lastActive.current === active) return;
    lastActive.current = active;
    const el = listRef.current;
    if (!el) return;
    const idx = tabs.findIndex((t) => t.id === active);
    const cell = idx >= 0 ? (el.children[idx] as HTMLElement | undefined) : undefined;
    if (!cell) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 4) return;
    // Land the cell on the row's start edge, which is also where scroll-snap
    // wants it. Centering instead would be undone by the snap on release.
    const base = (el.children[0] as HTMLElement).offsetLeft;
    const target = Math.max(0, Math.min(max, cell.offsetLeft - base));
    if (Math.abs(target - el.scrollLeft) < 8) return;
    el.scrollTo({ left: target, behavior: reduced ? 'auto' : 'smooth' });
  }, [active, reduced, tabs]);

  /// The peek. Once per session per strip, only from a resting position, only
  /// when something is actually hidden, never under reduced motion. It waits
  /// for the strip to be on screen: on /profile the strip sits well below the
  /// fold, and a nudge nobody saw still burns the session flag. Snap is
  /// suspended for the duration or the browser fights the tween.
  useEffect(() => {
    const el = listRef.current;
    const host = navRef.current;
    if (!el || !host || typeof window === 'undefined' || reduced) return;
    const key = `${NUDGE_KEY}:${tabKey}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
    } catch {
      return;
    }

    let raf = 0;
    let timer = 0;
    const restoreSnap = el.style.scrollSnapType;

    const peek = () => {
      if (el.scrollWidth - el.clientWidth < PEEK_PX) return;
      if (el.scrollLeft > 2) return;
      try {
        window.sessionStorage.setItem(key, '1');
      } catch {
        /* private mode: peek every visit rather than not at all */
      }
      el.style.scrollSnapType = 'none';
      const started = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - started) / PEEK_MS);
        el.scrollLeft = Math.sin(p * Math.PI) * PEEK_PX;
        if (p < 1) {
          raf = requestAnimationFrame(step);
          return;
        }
        el.scrollLeft = 0;
        el.style.scrollSnapType = restoreSnap;
      };
      raf = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        timer = window.setTimeout(peek, PEEK_DELAY_MS);
      },
      { threshold: 0.75 },
    );
    io.observe(host);

    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      el.style.scrollSnapType = restoreSnap;
    };
  }, [tabKey, reduced]);

  const page = (dir: 'start' | 'end') => {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({
      left: (dir === 'end' ? 1 : -1) * el.clientWidth * 0.68,
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  /// Frosted surface: dark hero tone at rest, near-opaque on scroll so
  /// labels stay legible no matter what light/dark band slides behind it.
  /// The strip itself is full-bleed (see `.w-bleed` on the nav) so the
  /// surface paints edge-to-edge of the viewport rather than stopping at
  /// the centered content gutter. The earlier gap on left + right was the
  /// nav inheriting its parent's content width, not a color issue.
  const surface = stuck
    ? onDark
      ? 'color-mix(in srgb, var(--lp-band-dark) 88%, transparent)'
      : 'color-mix(in srgb, var(--lp-card) 92%, transparent)'
    : onDark
      ? 'color-mix(in srgb, var(--lp-band-dark) 70%, transparent)'
      : 'color-mix(in srgb, var(--lp-card) 70%, transparent)';

  /// Outset box-shadow + horizontal clip-path is the bullet-proof full-bleed
  /// technique. The nav element keeps its natural content width (so layout
  /// math stays sane) and the box-shadow stretches a SOLID base color
  /// horizontally 100vmax in both directions. clipPath crops the vertical
  /// overflow so the shadow only paints in the strip's own row.
  ///
  /// The bleed uses the OPAQUE base colour (not the translucent surface)
  /// because box-shadow doesn't pick up the nav's backdrop-filter. If we
  /// used the translucent surface, the bleed area would alpha-blend through
  /// to whatever's behind and look noticeably different from the frosted
  /// strip area, which read to users as a hard cutoff. The frosted look
  /// stays where it should (the actual nav area); the bleed is a quieter
  /// solid colour that just extends the strip's "footprint" to viewport
  /// edges so no cream/black sliver leaks through past the last tab.
  const bleedColor = onDark ? 'var(--lp-band-dark)' : 'var(--lp-card)';
  const bleedShadow = `0 0 0 100vmax ${bleedColor}`;
  const dropShadow = stuck
    ? onDark
      ? '0 8px 24px -16px rgba(0,0,0,0.6)'
      : '0 8px 24px -16px rgba(12,14,16,0.18)'
    : '';
  const combinedBoxShadow = dropShadow ? `${bleedShadow}, ${dropShadow}` : bleedShadow;

  return (
    <nav
      ref={navRef}
      className={cn(
        'sticky z-20 transition-[background,border-color,box-shadow] duration-[var(--dur-fast)]',
        className,
      )}
      style={{
        // Below the TopNav so they stack; z-20 keeps the TopNav (z-30)
        // visually on top if any margin ever overlaps.
        top: TOPNAV_OFFSET,
        background: surface,
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        borderBottom: `1px solid ${onDark ? 'var(--rule-dark)' : 'var(--rule-light)'}`,
        boxShadow: combinedBoxShadow,
        /// Clip vertically tight to the strip's own box so the outset
        /// bleed shadow only paints horizontally, never bleeds onto the
        /// row above or below.
        clipPath: 'inset(0 -100vmax)',
      }}
      data-chrome="strip"
      aria-label={a11y.sectionNavigation}
    >
      <ul
        ref={listRef}
        role="tablist"
        // Mobile: horizontal scroll, each tab sized to content so labels never
        // wrap. Desktop (md+): equal-width grid columns as designed in §4.5.
        // The fade mask we tried earlier produced a cream sliver on the right
        // edge that read as a layout bug, removed. Mobile users discover
        // scroll naturally; the meaningful fix is generous right-padding on
        // the scroll container so the LAST tab can fully reach into view
        // instead of getting clipped by the viewport edge.
        className="mx-auto flex md:grid overflow-x-auto md:overflow-visible no-scrollbar"
        style={{
          maxWidth: contentMaxWidth,
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          // Extra right padding on mobile so the last tab has scroll room
          // past the viewport edge instead of getting cut off mid-word.
          // Desktop keeps the symmetric clamp.
          paddingLeft: PAD_START,
          paddingRight: PAD_END,
          scrollSnapType: 'x mandatory',
          // Without this the first cell's snap target is its offsetLeft, so the
          // row rests at scrollLeft ≈ 18 instead of 0 and the "more to the left"
          // pager is on from the moment the page loads. Snapping to the same
          // inset as the padding puts the resting position back at zero.
          scrollPaddingInlineStart: PAD_START,
        }}
      >
        {tabs.map((t, i) => {
          const isActive = active === t.id;
          const isLast = i === tabs.length - 1;
          return (
            <li
              key={t.id}
              role="presentation"
              /// Sized so the NEXT tab is always half in frame on a phone. A
              /// cut-off cell is the cheapest "there is more here" signal there
              /// is; two tabs filling the row exactly read as the whole set.
              className="w-[40vw] max-w-[168px] shrink-0 md:w-auto md:max-w-none md:shrink"
              style={{
                borderInlineEnd: isLast
                  ? 'none'
                  : `1px solid ${onDark ? 'var(--rule-dark)' : 'var(--rule-light)'}`,
                scrollSnapAlign: 'start',
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={t.count == null ? t.label : `${t.label}, ${t.count}`}
                onClick={() => {
                  onChange?.(t.id);
                  if (t.hash) {
                    const el = document.getElementById(t.hash);
                    if (el) {
                      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
                    }
                  }
                }}
                className={cn(
                  'group relative w-full min-h-11 cursor-pointer flex items-center justify-between gap-2 md:gap-3 py-3.5 md:py-5 px-3 md:px-4 font-mono text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.06em] md:tracking-[0.08em] whitespace-nowrap transition-colors duration-[var(--dur-micro)] hover:bg-black/[0.035] focus-visible:bg-black/[0.035]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset',
                )}
                style={{
                  // Active must read against the actual surface. On a dark
                  // strip the ink-black token disappears; use the primary
                  // light-on-dark token instead.
                  color: isActive
                    ? onDark
                      ? 'var(--ink-1)'
                      : 'var(--lp-dark)'
                    : onDark
                      ? 'var(--ink-1)'
                      : 'var(--ink-inv-2)',
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId={LAYOUT_ID}
                    aria-hidden
                    className="absolute start-0 end-0 top-0 h-[2px]"
                    style={{ background: 'var(--accent)' }}
                    transition={slide}
                  />
                )}
                <span className="inline-flex items-center gap-1.5 md:gap-2">
                  <span
                    aria-hidden
                    className="inline-block w-[5px] h-[5px] md:w-[6px] md:h-[6px]"
                    style={{
                      background: isActive
                        ? 'var(--accent)'
                        : onDark
                          ? 'var(--ink-3)'
                          : 'var(--ink-inv-2)',
                      borderRadius: 1,
                    }}
                  />
                  [:{t.label}]
                  {t.count != null ? (
                    <span className="font-sans text-[10px] font-extrabold tabular-nums tracking-normal md:text-[11px]">
                      {String(t.count).padStart(2, '0')}
                    </span>
                  ) : null}
                  {t.attention ? <ActionBeacon /> : null}
                </span>
                <span
                  aria-hidden
                  className="hidden md:inline transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5"
                  style={{
                    color: isActive
                      ? onDark
                        ? 'var(--ink-1)'
                        : 'var(--lp-dark)'
                      : onDark
                        ? 'var(--ink-3)'
                        : 'var(--ink-inv-2)',
                    transform: isActive ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                >
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {/* Position rail. A track the width of the whole set with a thumb a
          quarter of it: the scrollbar metaphor, so it reads as "swipe" without
          a word of copy, and it slides on every change so the movement between
          panels is visible. Deliberately a continuous track rather than one
          mark per tab, which would be mistaken for a second underline. */}
      <div
        aria-hidden
        className="mx-auto pb-2 md:hidden"
        style={{ maxWidth: contentMaxWidth, paddingLeft: PAD_START, paddingRight: PAD_END }}
      >
        <div
          className="relative h-[2px] w-full"
          style={{
            // The rule tokens are too faint to carry the track on their own;
            // this sits between a hairline and body ink so the extent is
            // legible without competing with the lime thumb.
            background: onDark
              ? 'var(--ink-3)'
              : 'color-mix(in srgb, var(--lp-text-muted) 50%, transparent)',
          }}
        >
          <motion.span
            className="absolute inset-y-0"
            style={{ background: 'var(--accent)', width: `${100 / tabs.length}%` }}
            animate={{
              left: `${(Math.max(0, tabs.findIndex((t) => t.id === active)) * 100) / tabs.length}%`,
            }}
            transition={slide}
          />
        </div>
      </div>

      {/* Edge pagers. Redundant with the swipe and with the tablist itself, so
          they stay out of the tab order and out of the a11y tree. */}
      {(['start', 'end'] as const).map((side) => {
        const live = side === 'start' ? reach.start : reach.end;
        const edge = onDark ? 'var(--lp-band-dark)' : 'var(--lp-card)';
        return (
          <button
            key={side}
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => page(side)}
            className={cn(
              'absolute top-0 bottom-[10px] flex w-11 cursor-pointer items-center md:hidden',
              'transition-opacity duration-[var(--dur-fast)]',
              side === 'start' ? 'start-0 justify-start ps-2' : 'end-0 justify-end pe-2',
              live ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            style={{
              background: `linear-gradient(${side === 'start' ? '270deg' : '90deg'}, transparent, ${edge} 72%)`,
              // Same ink as an unselected label. Muted grey put the one cue
              // that says "there is more" below the things it points at.
              color: onDark ? 'var(--ink-2)' : 'var(--ink-inv-2)',
            }}
          >
            <span className="font-mono text-[17px] leading-none">
              {side === 'start' ? '‹' : '›'}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
