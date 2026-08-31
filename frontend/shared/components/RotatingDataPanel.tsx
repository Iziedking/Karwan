'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';

export interface RotatingDataSlide {
  id: string;
  label: string;
  content: ReactNode;
}

interface RotatingDataPanelProps {
  label: string;
  slides: RotatingDataSlide[];
  className?: string;
  intervalMs?: number;
}

/**
 * One calm frame for a related set of live readings. Automatic rotation pauses
 * while the panel is being used, and is disabled when reduced motion is set.
 */
export function RotatingDataPanel({
  label,
  slides,
  className,
  intervalMs = 5600,
}: RotatingDataPanelProps) {
  const common = useTranslations().common;
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const count = slides.length;
  const paused = interactionPaused || userPaused;

  const select = useCallback(
    (index: number) => {
      if (count === 0) return;
      setActiveIndex((index + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (reduceMotion || paused || count <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % count);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [count, intervalMs, paused, reduceMotion]);

  useEffect(() => {
    if (activeIndex >= count && count > 0) setActiveIndex(0);
  }, [activeIndex, count]);

  const active = slides[activeIndex];
  if (!active) return null;

  return (
    <section
      aria-label={label}
      aria-roledescription="carousel"
      className={cn(
        'relative w-full min-w-0 overflow-hidden border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-raised)]',
        className,
      )}
      style={{ borderRadius: 18 }}
      onPointerEnter={() => setInteractionPaused(true)}
      onPointerLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setInteractionPaused(false);
      }}
    >
      <div className="flex min-h-16 items-center justify-between gap-4 border-b border-[var(--lp-workspace-border)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="mono truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--lp-workspace-muted)]">
            [:{active.label}:]
          </p>
          <p className="mt-1 mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-workspace-faint)] tabular-nums">
            {String(activeIndex + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
          </p>
        </div>

        {count > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            {!reduceMotion && (
              <button
                type="button"
                aria-label={userPaused ? common.resume : common.pause}
                aria-pressed={userPaused}
                onClick={() => setUserPaused((current) => !current)}
                className="inline-flex size-11 items-center justify-center border border-[var(--lp-workspace-border)] text-[var(--lp-workspace-muted)] transition-colors duration-200 hover:border-[var(--lp-workspace-ink)] hover:text-[var(--lp-workspace-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-workspace-band)]"
                style={{ borderRadius: 10 }}
              >
                {userPaused ? (
                  <span aria-hidden className="ms-0.5 block h-0 w-0 border-y-[5px] border-y-transparent border-s-[8px] border-s-current" />
                ) : (
                  <span aria-hidden className="flex gap-1">
                    <span className="h-3 w-px bg-current" />
                    <span className="h-3 w-px bg-current" />
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              aria-label={common.back}
              onClick={() => select(activeIndex - 1)}
              className="inline-flex size-11 items-center justify-center border border-[var(--lp-workspace-border)] text-[var(--lp-workspace-muted)] transition-colors duration-200 hover:border-[var(--lp-workspace-ink)] hover:text-[var(--lp-workspace-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-workspace-band)]"
              style={{ borderRadius: 10 }}
            >
              <span aria-hidden className="mono text-[18px] leading-none">‹</span>
            </button>
            <button
              type="button"
              aria-label={common.next}
              onClick={() => select(activeIndex + 1)}
              className="inline-flex size-11 items-center justify-center border border-[var(--lp-workspace-border)] text-[var(--lp-workspace-muted)] transition-colors duration-200 hover:border-[var(--lp-workspace-ink)] hover:text-[var(--lp-workspace-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-workspace-band)]"
              style={{ borderRadius: 10 }}
            >
              <span aria-hidden className="mono text-[18px] leading-none">›</span>
            </button>
          </div>
        )}
      </div>

      <div className="relative min-h-[250px] sm:min-h-[290px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.id}
            role="group"
            aria-label={`${activeIndex + 1} / ${count}`}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col justify-center p-5 sm:p-7"
          >
            {active.content}
          </motion.div>
        </AnimatePresence>
      </div>

      {count > 1 && (
        <div className="grid h-1 grid-flow-col gap-px bg-[var(--lp-workspace-soft)]" aria-hidden>
          {slides.map((slide, index) => (
            <span
              key={slide.id}
              className={cn(
                'transition-colors duration-300',
                index === activeIndex ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-workspace-border)]',
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function DataMetric({
  value,
  unit,
  hint,
  loading,
}: {
  value: ReactNode;
  unit?: string;
  hint?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-4" aria-hidden>
        <div className="h-14 w-40 bg-[var(--lp-workspace-soft)] motion-safe:animate-pulse" />
        <div className="h-3 w-56 max-w-full bg-[var(--lp-workspace-soft)] motion-safe:animate-pulse" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 max-w-full font-sans text-[clamp(2.75rem,8vw,5.5rem)] font-extrabold leading-none tracking-[-0.045em] text-[var(--lp-workspace-ink)] tabular-nums">
          {value}
        </span>
        {unit && (
          <span className="mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--lp-workspace-muted)]">
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <p className="mt-4 max-w-[42ch] text-[13px] leading-relaxed text-[var(--lp-workspace-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}
