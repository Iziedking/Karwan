'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { deviceLevel, frameVerdict, lower, readSaved, saveDown, stepDown, type MotionLevel as Level } from './level';

/// The device's motion level for the whole app (view 86). Pages render as
/// full until this has read the browser, the same on the server and the first
/// paint, so nothing hydrates differently.
let current: Level = 'full';
const listeners = new Set<() => void>();

function setLevel(level: Level) {
  if (level === current) return;
  current = level;
  document.documentElement.dataset.motion = level;
  for (const fn of listeners) fn();
}

export function useMotionLevel(): Level {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => 'full',
  );
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

function storage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
}

/// A frame counts only while the page is being scrolled.
const SCROLLING_MS = 150;
/// The watch gives up after this long, judged or not.
const WATCH_MS = 10_000;

/// Reads the device, sets `data-motion` on <html>, and for the first stretch
/// of scrolling counts frames; if they keep running late, steps down once and
/// remembers it on this device for 30 days.
export function MotionLevel() {
  useEffect(() => {
    const nav = navigator as Navigator & { connection?: NetworkInformationLike; deviceMemory?: number };
    const store = storage();
    const now = Date.now();
    const level = lower(
      deviceLevel({
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        saveData: nav.connection?.saveData === true,
        effectiveType: nav.connection?.effectiveType,
        deviceMemory: nav.deviceMemory,
        cores: nav.hardwareConcurrency || undefined,
      }),
      readSaved(store, now),
    );
    document.documentElement.dataset.motion = level;
    setLevel(level);
    if (level === 'still') return;

    const gaps: number[] = [];
    let lastScroll = 0;
    let lastFrame = 0;
    let began = 0;
    let frame = 0;
    const finish = () => {
      window.removeEventListener('scroll', onScroll);
      if (frameVerdict(gaps) === 'down') {
        const next = stepDown(level);
        saveDown(store, next, Date.now());
        setLevel(next);
      }
    };
    const tick = (t: number) => {
      if (document.hidden) lastFrame = 0;
      else if (t - lastScroll < SCROLLING_MS) {
        if (lastFrame) gaps.push(t - lastFrame);
        lastFrame = t;
      } else lastFrame = 0;
      if (gaps.length >= 60 || t - began > WATCH_MS) finish();
      else frame = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      lastScroll = performance.now();
      if (!began) {
        began = lastScroll;
        frame = requestAnimationFrame(tick);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
