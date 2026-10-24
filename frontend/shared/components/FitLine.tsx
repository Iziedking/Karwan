'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { needsRefit } from '@/shared/utils/fitLine';

const MAX = 16;
const MIN = 13;

/// One line of text that must be read whole, such as a deposit address: it
/// shrinks until it fits its column, never below 13px, and only if it still
/// does not fit does it wrap. It is never cut short.
export function FitLine({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [size, setSize] = useState(MAX);
  const [wrap, setWrap] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const column = el.parentElement ?? el;
    let fittedWidth = 0;
    const fit = () => {
      fittedWidth = column.clientWidth;
      // Measured at full size on one line, then put back as it was until the
      // new size renders.
      const before = { size: el.style.fontSize, space: el.style.whiteSpace };
      el.style.fontSize = `${MAX}px`;
      el.style.whiteSpace = 'nowrap';
      const room = el.clientWidth;
      const need = el.scrollWidth;
      const next = need <= room ? MAX : Math.floor((MAX * room) / need * 10) / 10;
      el.style.fontSize = before.size;
      el.style.whiteSpace = before.space;
      setSize(Math.max(MIN, Math.min(MAX, next)));
      setWrap(next < MIN);
    };
    fit();
    const observer = new ResizeObserver(() => {
      if (needsRefit(fittedWidth, column.clientWidth)) fit();
    });
    observer.observe(column);
    return () => observer.disconnect();
  }, [text]);

  return (
    <p
      ref={ref}
      dir="ltr"
      className={cn('select-all overflow-hidden tabular-nums', wrap ? 'break-all' : 'whitespace-nowrap', className)}
      style={{ fontSize: size, fontVariantNumeric: 'tabular-nums' }}
    >
      {text}
    </p>
  );
}
