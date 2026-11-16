'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { BLINK_MS, DOUBLE_GAP_MS, blinkPlan, breathOffset, gazeToward, lifeAllowed, type Life } from '@/features/guide/amanLife';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useMotionLevel } from '@/shared/motion/MotionLevel';

/// One clock for every Aman on the page (view 57, 15 Nov evening): ten faces
/// cost one animation frame, and nothing runs in a hidden tab.
type Tick = (t: number) => void;
const ticks = new Set<Tick>();
let frame = 0;
let pointer: { x: number; y: number } | null = null;
let pointerListening = false;

function loop(t: number) {
  frame = 0;
  if (document.hidden || ticks.size === 0) return;
  for (const tick of ticks) tick(t);
  frame = requestAnimationFrame(loop);
}
function wake() {
  if (!frame && ticks.size > 0 && !document.hidden) frame = requestAnimationFrame(loop);
}
function subscribe(tick: Tick): () => void {
  ticks.add(tick);
  if (!pointerListening) {
    pointerListening = true;
    window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
    document.addEventListener('visibilitychange', wake);
  }
  wake();
  return () => {
    ticks.delete(tick);
    if (ticks.size === 0 && frame) { cancelAnimationFrame(frame); frame = 0; }
  };
}

function useHidden(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const read = () => setHidden(document.hidden);
    read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, []);
  return hidden;
}

const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

export interface AmanLifeOptions {
  /// Where the eyes look: a fixed direction, 'pointer' (the default) to follow
  /// the mouse within 400 px, or null to keep them centred.
  look?: { x: number; y: number } | 'pointer' | null;
  /// Keeps one face's blink rhythm apart from another's on the same page.
  seed?: string;
}

/// Blink, gaze and breath for one face. Breath is written as `--aman-breath` on
/// `ref`, so the face does not re-render for it; blink and gaze come back as
/// props for `AmanFace`.
export function useAmanLife(ref: RefObject<Element | null>, { look = 'pointer', seed = 'aman' }: AmanLifeOptions = {}): { life: Life; blink: boolean; gaze: { x: number; y: number } | undefined } {
  const reduced = useHydratedReducedMotion();
  const level = useMotionLevel();
  const hidden = useHidden();
  const life = lifeAllowed({ reduced, level, hidden });
  const [blink, setBlink] = useState(false);
  const [pointerGaze, setPointerGaze] = useState<{ x: number; y: number } | undefined>(undefined);
  const last = useRef<{ x: number; y: number } | undefined>(undefined);

  useEffect(() => {
    if (life === 'none') { setBlink(false); return; }
    const s = seedOf(seed);
    let n = 0;
    let timer = 0;
    const close = (then: () => void) => {
      setBlink(true);
      timer = window.setTimeout(() => { setBlink(false); then(); }, BLINK_MS);
    };
    const next = () => {
      const plan = blinkPlan(s, n);
      timer = window.setTimeout(() => {
        close(() => {
          n += 1;
          if (plan.double) timer = window.setTimeout(() => close(next), DOUBLE_GAP_MS - BLINK_MS);
          else next();
        });
      }, plan.delay);
    };
    next();
    return () => window.clearTimeout(timer);
  }, [life, seed]);

  const follows = look === 'pointer';
  useEffect(() => {
    const el = ref.current as HTMLElement | SVGElement | null;
    if (life !== 'full') {
      el?.style.removeProperty('--aman-breath');
      setPointerGaze(undefined);
      return;
    }
    return subscribe((t) => {
      const node = ref.current as HTMLElement | SVGElement | null;
      if (!node) return;
      node.style.setProperty('--aman-breath', breathOffset(t).toFixed(3));
      if (!follows) return;
      const r = node.getBoundingClientRect();
      const g = pointer ? gazeToward({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, pointer) : { x: 0, y: 0 };
      const prev = last.current;
      if (!prev || Math.abs(prev.x - g.x) > 0.05 || Math.abs(prev.y - g.y) > 0.05) {
        last.current = g;
        setPointerGaze(g.x === 0 && g.y === 0 ? undefined : g);
      }
    });
  }, [life, follows, ref]);

  const gaze = life === 'none' ? undefined : follows ? pointerGaze : look ?? undefined;
  return { life, blink, gaze };
}
