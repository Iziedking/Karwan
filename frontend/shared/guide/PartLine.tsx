'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { m } from 'motion/react';
import { lineMode, LINE_WIDTH, type LineMode } from '@/features/guide/pickPart';
import type { Rect } from '@/features/guide/placeAman';
import { dur, ease } from '@/shared/motion/tokens';
import { AmanFace } from './AmanFace';
import { PointRing } from './PointRing';
import { widenGap } from './partGap';
import type { PartLineKind } from './usePartGuide';

const SIDE_GAP = 16;
const EDGE = 8;
const TOP_MAX = 560;

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/// The time left on a line Aman says on its own: a thin bar that empties.
export function TimeBar({ ms, rtl, reduce }: { ms: number; rtl: boolean; reduce: boolean | undefined }) {
  return (
    <div aria-hidden className="mt-2.5 h-0.5 overflow-hidden rounded-full bg-[var(--soft-green-edge)]">
      <m.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: reduce ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : ms / 1000, ease: 'linear' }}
        style={{ transformOrigin: rtl ? 'right' : 'left' }}
        className="h-full bg-[var(--karwan-green)]"
      />
    </div>
  );
}

export interface LineButton { label: string; act: () => void; main?: boolean }

/// A line Aman says on its own (view 57, 19 Nov; Figma 364:4506, 365:4623,
/// 365:4909, 366:5504). A part line sits under its part on a phone and a
/// tablet, where the page opens a gap for it, and beside the part on a laptop.
/// The hello, the check-in and "switched off" open at the top of the page.
/// Either way nothing on the page is covered.
export function PartLine({ el, kind, id, ms, text, label, rtl, reduce, buttons = [], onGone }: {
  el: HTMLElement;
  kind: PartLineKind;
  id?: string;
  ms: number;
  text: string;
  label: string;
  rtl: boolean;
  reduce: boolean | undefined;
  buttons?: LineButton[];
  onGone: () => void;
}) {
  const atTop = kind !== 'part';
  const lineRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<Rect>(() => rectOf(el));
  const mode = useRef<LineMode>(atTop ? { mode: 'inline' } : lineMode({ viewportWidth: window.innerWidth, partRect: rectOf(el), rtl })).current;
  const [height, setHeight] = useState(0);
  const goneRef = useRef(onGone);
  goneRef.current = onGone;

  // Inline: the page opens a gap the size of the line, and closes it after.
  useLayoutEffect(() => {
    if (!lineRef.current) return;
    const h = lineRef.current.offsetHeight;
    setHeight(h);
    if (mode.mode !== 'inline') return undefined;
    return atTop ? widenGap(el, h + EDGE * 2, undefined, 'paddingBlockStart') : widenGap(el, h + EDGE);
  }, [el, mode, atTop]);

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!el.isConnected) return goneRef.current();
      const r = rectOf(el);
      if (!atTop && (r.height === 0 || r.top + r.height < 0 || r.top > window.innerHeight)) return goneRef.current();
      setRect((prev) => (prev.left === r.left && prev.top === r.top && prev.width === r.width && prev.height === r.height ? prev : r));
    };
    const later = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', later, { capture: true, passive: true });
    window.addEventListener('resize', later);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', later, { capture: true });
      window.removeEventListener('resize', later);
    };
  }, [el, atTop]);

  let style: CSSProperties;
  if (atTop) {
    const width = Math.min(rect.width - SIDE_GAP * 2, TOP_MAX);
    const left = rtl ? rect.left + rect.width - SIDE_GAP - width : rect.left + SIDE_GAP;
    style = { position: 'absolute', left: left + window.scrollX, top: rect.top + window.scrollY + EDGE, width };
  } else if (mode.mode === 'inline') {
    style = { position: 'absolute', left: rect.left + window.scrollX, top: rect.top + rect.height + window.scrollY + EDGE / 2, width: rect.width };
  } else {
    const toRight = (mode.side === 'end') !== rtl;
    const left = toRight ? rect.left + rect.width + SIDE_GAP : rect.left - SIDE_GAP - LINE_WIDTH;
    const h = height || 96;
    const top = Math.min(Math.max(rect.top + rect.height / 2 - h / 2, EDGE), window.innerHeight - h - EDGE);
    style = { position: 'fixed', left, top, width: LINE_WIDTH };
  }
  const radius = atTop ? 0 : parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12;

  const node = (
    <>
      {atTop ? null : <PointRing rect={rect} radius={radius} />}
      <m.div
        ref={lineRef}
        role="complementary"
        aria-label={label}
        data-aman-line={kind}
        data-part={id}
        data-mode={mode.mode}
        initial={{ opacity: 0, y: reduce ? 0 : -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? dur.micro : 0.2, ease: ease.out }}
        style={style}
        className="z-40 flex items-start gap-2.5 rounded-[18px] border border-[var(--soft-green-edge)] bg-[var(--soft-green)] px-3.5 py-3 text-[var(--ink)]"
      >
        <span className="shrink-0 pt-0.5"><AmanFace size={28} mood="talking" label={null} /></span>
        <span className="min-w-0 flex-1">
          <p role="status" aria-live="polite" className="guide-voice text-[15px] font-semibold leading-[1.35]">{text}</p>
          {buttons.length ? (
            <span className="mt-2.5 flex flex-wrap items-center gap-2">
              {buttons.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={b.act}
                  className={b.main
                    ? 'inline-flex min-h-10 items-center rounded-full bg-[var(--action)] px-4 text-[15px] font-bold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--soft-green)]'
                    : 'inline-flex min-h-10 items-center rounded-full px-3 text-[15px] font-semibold opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]'}
                >
                  {b.label}
                </button>
              ))}
            </span>
          ) : null}
          <TimeBar ms={ms} rtl={rtl} reduce={reduce} />
        </span>
      </m.div>
    </>
  );
  return createPortal(node, document.body);
}
