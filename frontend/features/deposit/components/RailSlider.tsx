'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { LpHint } from '@/shared/components/LpHint';
import type { DepositRail, RailOption } from '../railModel';

/// The rail chooser, and the way one panel becomes the next.
///
/// Four routes on one track. The active one carries a lozenge that SLIDES
/// between them rather than cutting, which is the only thing that makes a row of
/// buttons read as one control, and the panel underneath rises into place behind
/// a lime line travelling across its top edge.
///
/// That line replaced a blackout: the first version swept an ink band with a
/// lime edge across the whole panel, which on a light page is a dark rectangle
/// crossing content mid-read. It looked broken. The line says the same thing
/// (something changed, here) without ever covering what the reader came for.
///
/// Under `prefers-reduced-motion` the sweep is not painted at all and the
/// lozenge stops sliding.

/// Must match the CSS in globals.css (`.rail-wipe`).
const WIPE_MS = 420;

export function RailSlider({
  rails,
  active,
  onChange,
  children,
}: {
  rails: RailOption[];
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

  const index = Math.max(
    0,
    rails.findIndex((rail) => rail.id === active),
  );

  return (
    <div>
      {/* The track. One column per rail, so the lozenge width is a fraction of
          the whole and the labels never reflow when the set changes size. */}
      <div
        role="tablist"
        aria-label={copy.chooserAria}
        className="relative grid gap-0 p-1"
        style={{
          gridTemplateColumns: `repeat(${rails.length}, minmax(0, 1fr))`,
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderRadius: 999,
        }}
      >
        <span
          aria-hidden
          className="absolute top-1 bottom-1 transition-transform duration-[320ms] ease-out motion-reduce:transition-none"
          style={{
            // Exactly one column wide, because translateX is a percentage of the
            // element's OWN width: any inset here and the lozenge falls short of
            // its tab by that much per column, drifting a couple of pixels
            // further out with every step along the track.
            width: `${100 / rails.length}%`,
            left: 4,
            borderRadius: 999,
            background: 'var(--lp-band-dark)',
            transform: `translateX(${index * 100}%)`,
          }}
        />
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
                'relative z-10 flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 py-2.5',
                'mono text-[10px] font-bold uppercase tracking-[0.08em] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-inset',
              )}
              style={{ color: current ? '#ffffff' : 'var(--lp-text-sub)' }}
            >
              <span className="truncate">{copy[rail.id].tab}</span>
              {/* A rail that is real but not yet available says so on the tab,
                  so nobody presses it twice wondering what happened. */}
              {rail.state === 'soon' && (
                <span
                  aria-hidden
                  className="hidden shrink-0 rounded-full px-1 py-[1px] text-[8px] leading-none sm:inline"
                  style={{
                    background: current ? 'rgba(255,255,255,0.18)' : 'var(--lp-border-light)',
                    color: current ? '#ffffff' : 'var(--lp-text-muted)',
                  }}
                >
                  {copy.soon}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Title and one line about the rail. The explanation belongs here, above
          the form, because choosing the rail IS the question this page asks. */}
      <div className="mt-5">
        <span className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
          [:{copy[active].tag}:]
        </span>
        <div className="mt-2 flex items-center gap-2">
          <h2 className="text-[26px] font-extrabold uppercase leading-[1.1] tracking-tight text-[var(--lp-dark)]">
            {copy[active].title}
          </h2>
          <LpHint side="bottom" align="start">{copy[active].blurb}</LpHint>
        </div>
      </div>

      {/* The panel, and the sweep on its top edge. A sibling rather than a
          wrapper so it never becomes a containing block for anything inside the
          panel (a sticky header, a portalled tooltip). */}
      <div className="relative mt-6">
        <div key={active} className={cn(wiping ? 'rail-panel-in' : undefined)}>
          {children}
        </div>
        {wiping && <span aria-hidden className="rail-wipe" />}
      </div>
    </div>
  );
}
