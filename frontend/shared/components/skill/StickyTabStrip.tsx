'use client';
import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { dur, ease } from '@/shared/motion/tokens';

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
}

const LAYOUT_ID = 'skill-tab-strip-indicator';

/// TopNav owns the first 68px of the viewport (`sticky top-0 z-30`, see
/// shared/components/TopNav.tsx). The tab strip docks immediately below it
/// so the two stack instead of fighting for the same `top: 0` slot,
/// without this anchor the strip slid behind the TopNav and read as
/// "vanishing on scroll" to the user. Mobile keeps the same offset; the
/// TopNav is the same height on small screens.
const TOPNAV_OFFSET_PX = 68;

export function StickyTabStrip({
  tabs,
  active,
  onChange,
  className,
  onDark = true,
}: {
  tabs: Tab[];
  active: string;
  onChange?: (id: string) => void;
  className?: string;
  onDark?: boolean;
}) {
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
      className={cn(
        'sticky z-20 transition-[background,border-color,box-shadow,backdrop-filter] duration-[var(--dur-fast)]',
        className,
      )}
      style={{
        // Below the TopNav so they stack; z-20 keeps the TopNav (z-30)
        // visually on top if any margin ever overlaps.
        top: TOPNAV_OFFSET_PX,
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
      aria-label="Section navigation"
    >
      <ul
        role="tablist"
        // Mobile: horizontal scroll, each tab sized to content so labels never
        // wrap. Desktop (md+): equal-width grid columns as designed in §4.5.
        // The fade mask we tried earlier produced a cream sliver on the right
        // edge that read as a layout bug, removed. Mobile users discover
        // scroll naturally; the meaningful fix is generous right-padding on
        // the scroll container so the LAST tab can fully reach into view
        // instead of getting clipped by the viewport edge.
        className="mx-auto max-w-[1320px] flex md:grid overflow-x-auto md:overflow-visible no-scrollbar"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          // Extra right padding on mobile so the last tab has scroll room
          // past the viewport edge instead of getting cut off mid-word.
          // Desktop keeps the symmetric clamp.
          paddingLeft: 'clamp(16px, 4vw, 56px)',
          paddingRight: 'max(clamp(16px, 4vw, 56px), 32px)',
          scrollSnapType: 'x mandatory',
        }}
      >
        {tabs.map((t, i) => {
          const isActive = active === t.id;
          const isLast = i === tabs.length - 1;
          return (
            <li
              key={t.id}
              role="presentation"
              className="shrink-0 md:shrink"
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
                onClick={() => {
                  onChange?.(t.id);
                  if (t.hash) {
                    const el = document.getElementById(t.hash);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className={cn(
                  'relative w-full flex items-center justify-between gap-2 md:gap-3 py-3.5 md:py-5 px-3 md:px-4 font-mono text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.06em] md:tracking-[0.08em] whitespace-nowrap transition-colors duration-[var(--dur-micro)]',
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
                      ? 'var(--ink-2)'
                      : 'var(--ink-inv-2)',
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId={LAYOUT_ID}
                    aria-hidden
                    className="absolute start-0 end-0 top-0 h-[2px]"
                    style={{ background: 'var(--accent)' }}
                    transition={{ duration: dur.base, ease: ease.out }}
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
                </span>
                <span
                  aria-hidden
                  className="hidden md:inline transition-transform duration-[var(--dur-fast)]"
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
    </nav>
  );
}
