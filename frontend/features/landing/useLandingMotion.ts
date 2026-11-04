'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { clipChoice, createFrameLoop, enterProgress, pinnedProgress, type ClipChoice } from './motion';

const REDUCED = '(prefers-reduced-motion: reduce)';

type Loop = ReturnType<typeof createFrameLoop>;
let loop: Loop | null = null;
let listening = false;

/// The page's one frame loop. Scroll and resize listeners exist only while a
/// scene is subscribed, and are passive so scrolling never waits on them.
function pageLoop(): Loop {
  if (!loop) loop = createFrameLoop((cb) => window.requestAnimationFrame(cb));
  return loop;
}

const wake = () => pageLoop().wake();

function listen(on: boolean) {
  if (on && !listening) {
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake, { passive: true });
    listening = true;
    pageLoop().wake();
  } else if (!on && listening) {
    window.removeEventListener('scroll', wake);
    window.removeEventListener('resize', wake);
    listening = false;
  }
}

/// True when the person asked for less motion. False on the server and on the
/// first paint, so the markup hydrates the same either way.
export function useReducedMotionPreference(): boolean {
  return useMediaQuery(REDUCED);
}

/// Writes the scene's progress (0 to 1) into its `--p` custom property every
/// frame it moves, without re-rendering React. Reduced motion pins it at 1, so
/// every scene shows its final state.
export function useSceneProgress(ref: RefObject<HTMLElement | null>, kind: 'pinned' | 'enter', span?: number) {
  const reduced = useReducedMotionPreference();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.style.setProperty('--p', '1');
      return;
    }
    let last = -1;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const viewport = window.innerHeight;
      const p = kind === 'pinned'
        ? pinnedProgress({ top: rect.top, height: rect.height, viewport })
        : enterProgress({ top: rect.top, viewport, span });
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      el.style.setProperty('--p', p.toFixed(4));
    };
    const off = pageLoop().add(measure);
    listen(true);
    measure();
    return () => {
      off();
      if (pageLoop().size() === 0) listen(false);
    };
  }, [ref, kind, span, reduced]);
}

/// Whether the element has been on screen. With `once`, it stays true after
/// the first time, so an entrance plays once and holds.
export function useInView(ref: RefObject<Element | null>, { once = false, rootMargin = '0px' }: { once?: boolean; rootMargin?: string } = {}): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        if (once) observer.disconnect();
      } else if (!once) {
        setInView(false);
      }
    }, { rootMargin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, once, rootMargin]);
  return inView;
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/// Which clip this screen loads: the poster until the browser has been read,
/// then the small or large clip, or the poster for reduced motion and slow or
/// saving connections.
export function useClipChoice(): ClipChoice {
  const reduced = useReducedMotionPreference();
  const [choice, setChoice] = useState<ClipChoice>('poster');
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    const decide = () => setChoice(clipChoice({
      reducedMotion: reduced,
      saveData: connection?.saveData === true,
      effectiveType: connection?.effectiveType,
      viewportWidth: window.innerWidth,
    }));
    decide();
    window.addEventListener('resize', decide, { passive: true });
    return () => window.removeEventListener('resize', decide);
  }, [reduced]);
  return choice;
}
