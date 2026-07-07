'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  /// When set, after the count-up settles the number periodically re-rolls: it
  /// drops to zero and counts back up to `value` every `replayEveryMs`. Skipped
  /// entirely under prefers-reduced-motion, and paused while the number is off
  /// screen so it never burns frames in a scrolled-away section.
  replayEveryMs?: number;
}

/// Counts up to `value` with an ease-out, and re-animates smoothly from wherever
/// it currently is when `value` changes. Snaps instantly under
/// prefers-reduced-motion. Pair with `tabular-nums` so digits do not jitter.
export function AnimatedNumber({ value, decimals = 2, duration = 750, className, replayEveryMs }: Props) {
  const [display, setDisplay] = useState(value);
  const currentRef = useRef(value);
  const spanRef = useRef<HTMLSpanElement>(null);
  // Bumped by the re-roll loop to retrigger the count-up effect from zero.
  const [replayNonce, setReplayNonce] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = currentRef.current;
    const to = value;
    if (reduce || from === to) {
      currentRef.current = to;
      setDisplay(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      currentRef.current = v;
      setDisplay(v);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        currentRef.current = to;
        setDisplay(to);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, replayNonce]);

  useEffect(() => {
    if (!replayEveryMs || replayEveryMs <= 0) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const el = spanRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        // Reset to zero, then let the count-up effect run 0 -> value again.
        currentRef.current = 0;
        setDisplay(0);
        setReplayNonce((n) => n + 1);
      }, replayEveryMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      stop();
      io.disconnect();
    };
  }, [replayEveryMs]);

  return (
    <span ref={spanRef} className={className}>
      {display.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}
