'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { LpHint } from '@/shared/components/LpHint';
import type { DepositRail, RailOption } from '../railModel';

/// One active money route, with neutral pills and a short panel transition.
/// Reduced motion is handled by the existing rail-panel-in animation rule.

/// Must match the CSS in globals.css (`.rail-wipe`).
const WIPE_MS = 420;

export function RailSlider({
  rails,
  active,
  onChange,
  direction = 'in',
  children,
}: {
  rails: RailOption[];
  /// Out of Arc the same rails read as withdrawals.
  direction?: 'in' | 'out';
  active: DepositRail;
  onChange: (rail: DepositRail) => void;
  /// The panel for the active rail. Re-rendered on every change; the wipe is
  /// driven from here rather than by the caller remounting.
  children: ReactNode;
}) {
  const copy = useTranslations().depositRails;
  const [wiping, setWiping] = useState(false);
  const previous = useRef(active);
  const timer = useRef(0);

  useEffect(() => {
    if (previous.current === active) return;
    previous.current = active;
    setWiping(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setWiping(false), WIPE_MS);
    return () => window.clearTimeout(timer.current);
  }, [active]);

  const hasRailChoice = rails.length > 1;
  const label = (rail: DepositRail) => {
    const c = copy[rail];
    if (direction === 'out' && rail === 'gateway') return { tab: copy.gateway.tabOut, title: copy.gateway.titleOut, blurb: copy.gateway.blurbOut };
    return { tab: c.tab, title: c.title, blurb: c.blurb };
  };

  return (
    <div>
      {/* One column per rail keeps the choices in a stable order. */}
      {hasRailChoice && (
        <div
          role="tablist"
          aria-label={copy.chooserAria}
          className="relative grid gap-1 rounded-[20px] bg-[var(--tint)] p-1"
          style={{
            gridTemplateColumns: `repeat(${rails.length}, minmax(0, 1fr))`,
          }}
        >
          {rails.map((rail) => {
            const current = rail.id === active;
            return (
              <button
                key={rail.id}
                type="button"
                role="tab"
                aria-selected={current}
                onClick={() => onChange(rail.id)}
                className={cn(
                  'flex min-h-12 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-full px-2 py-2 text-[14px] font-medium',
                  'transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-inset',
                  current ? 'bg-[var(--ink)] text-[var(--canvas)]' : 'text-[var(--ink)] hover:bg-[var(--line)]',
                )}
              >
                <span className="text-center leading-tight">{label(rail.id).tab}</span>
                {rail.state === 'soon' && (
                  <span
                    aria-hidden
                    className="shrink-0 rounded-full px-1 text-[13px] leading-none"
                    style={{
                      background: current ? 'var(--tint)' : 'transparent',
                      color: current ? 'var(--canvas)' : 'var(--ink-secondary)',
                    }}
                  >
                    {copy.soon}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Title and one line about the rail. The explanation belongs here, above
          the form, because choosing the rail IS the question this page asks. */}
      {hasRailChoice && (
        <div className="mt-5">
          <div className="mt-2 flex items-center gap-2">
            <h2 className="text-[22px] font-medium leading-tight tracking-[-0.015em] text-[var(--ink)]">
              {label(active).title}
            </h2>
            <LpHint side="bottom" align="start">{label(active).blurb}</LpHint>
          </div>
        </div>
      )}

      {/* Existing panels keep their state and movement handlers. */}
      <div className={cn('relative', hasRailChoice ? 'mt-6' : 'mt-0')}>
        <div key={active} className={cn(wiping ? 'rail-panel-in' : undefined)} style={{ animationDuration: 'var(--dur-panel)', animationTimingFunction: 'var(--ease-ui)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
