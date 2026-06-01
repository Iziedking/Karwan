'use client';
import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { dur, ease } from '@/shared/motion/tokens';

/// SKILL.md §4.5 — the sticky section tab strip. Equal columns, mono labels,
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

  return (
    <nav
      className={cn(
        'sticky top-0 z-30 transition-[background,border-color,backdrop-filter] duration-[var(--dur-fast)]',
        className,
      )}
      style={{
        background: stuck
          ? onDark
            ? 'rgba(10,10,11,0.72)'
            : 'rgba(244,244,241,0.78)'
          : 'transparent',
        backdropFilter: stuck ? 'blur(12px) saturate(140%)' : 'none',
        WebkitBackdropFilter: stuck ? 'blur(12px) saturate(140%)' : 'none',
        borderBottom: `1px solid ${stuck ? (onDark ? 'var(--rule-dark)' : 'var(--rule-light)') : 'transparent'}`,
      }}
      aria-label="Section navigation"
    >
      <ul
        role="tablist"
        // Mobile: horizontal scroll, each tab sized to content so labels never
        // wrap. Desktop (md+): equal-width grid columns as designed in §4.5.
        className="mx-auto max-w-[1320px] flex md:grid overflow-x-auto md:overflow-visible no-scrollbar"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          padding: '0 clamp(16px, 4vw, 56px)',
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
                borderRight: isLast
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
                    className="absolute left-0 right-0 top-0 h-[2px]"
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
