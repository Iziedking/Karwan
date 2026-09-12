'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ARC_MAINNET_LAUNCH_AT,
  formatArcCountdownUnit,
  getArcCountdownParts,
  type ArcCountdownParts,
} from './arcLaunchCountdownModel';

const ARC_MAINNET_EVENT_URL =
  'https://community.arc.io/home/events/arc-mainnet-launch-livestream';

type CountdownUnitProps = {
  label: string;
  value: number;
  reduceMotion: boolean;
};

export function ArcLaunchCountdown() {
  const reduceMotion = useReducedMotion();
  const [countdown, setCountdown] = useState<ArcCountdownParts | null>(null);

  useEffect(() => {
    const update = () => setCountdown(getArcCountdownParts(Date.now(), ARC_MAINNET_LAUNCH_AT));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const live = countdown?.totalMs === 0;

  return (
    <a
      href={ARC_MAINNET_EVENT_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Open the Arc Mainnet launch livestream event"
      className="group relative inline-flex min-h-12 min-w-[142px] max-w-[152px] items-center gap-2 overflow-hidden rounded-[15px] border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface-2)_42%,transparent)] px-2.5 py-1.5 text-[var(--color-ink)] transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-workspace-band)] sm:min-w-[252px] sm:max-w-[min(320px,36vw)] sm:gap-2.5 sm:rounded-full sm:px-3"
    >
      <span className="relative grid size-7 shrink-0 place-items-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-[color-mix(in_oklab,var(--lp-accent)_34%,transparent)] motion-safe:animate-[arc-countdown-pulse_2.4s_ease-out_infinite] motion-reduce:animate-none" />
        <span className="relative size-1.5 rounded-full bg-[var(--lp-accent)]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[9px] font-semibold tracking-[0.04em] text-[var(--color-ink-dim)] sm:text-[10px]">
          Arc Mainnet
        </span>
        <span className="mono mt-0.5 inline-flex min-w-0 items-baseline gap-1 text-[10px] font-bold tabular-nums tracking-[0.08em] sm:text-[11px]" aria-live="polite">
          {live ? (
            <span className="text-[var(--lp-accent)]">LIVE NOW</span>
          ) : countdown ? (
            <>
              <CountdownUnit label="days" value={countdown.days} reduceMotion={Boolean(reduceMotion)} />
              <span className="text-[var(--color-ink-faint)]">:</span>
              <CountdownUnit label="hours" value={countdown.hours} reduceMotion={Boolean(reduceMotion)} />
              <span className="text-[var(--color-ink-faint)]">:</span>
              <CountdownUnit label="minutes" value={countdown.minutes} reduceMotion={Boolean(reduceMotion)} />
              <span className="hidden text-[var(--color-ink-faint)] sm:inline">:</span>
              <span className="hidden sm:inline">
                <CountdownUnit label="seconds" value={countdown.seconds} reduceMotion={Boolean(reduceMotion)} />
              </span>
            </>
          ) : (
            <span className="inline-block w-[84px] text-[var(--color-ink-dim)] motion-safe:animate-pulse motion-reduce:animate-none">
              CHECKING
            </span>
          )}
        </span>
      </span>

      <span className="shrink-0 text-[15px] text-[var(--color-ink-dim)] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
        ↗
      </span>
      <span className="pointer-events-none absolute inset-x-3 bottom-0 h-px origin-left scale-x-0 bg-[var(--lp-accent)] opacity-70 transition-transform duration-300 group-hover:scale-x-100" aria-hidden />
    </a>
  );
}

function CountdownUnit({ label, value, reduceMotion }: CountdownUnitProps) {
  const formatted = formatArcCountdownUnit(value);

  return (
    <span className="inline-flex items-baseline" aria-label={`${value} ${label}`}>
      <motion.span
        key={formatted}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 5 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {formatted}
      </motion.span>
      <span className="ms-0.5 text-[8px] font-normal uppercase tracking-[0.02em] text-[var(--color-ink-faint)]">
        {label.slice(0, 1)}
      </span>
    </span>
  );
}
