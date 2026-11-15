'use client';

import { useEffect, useRef } from 'react';
import { m } from 'motion/react';
import { dur, ease } from '@/shared/motion/tokens';
import type { GuideCopy } from '@/shared/i18n/messages/guide';

interface Props {
  copy: GuideCopy;
  /// Where the face is, so the menu opens just above it on the same side.
  face: { x: number; y: number };
  rtl: boolean;
  reduce: boolean;
  onAsk: () => void;
  onQuiet: () => void;
  onHide: () => void;
  onClose: () => void;
}

const WIDTH = 248;

/// Aman's menu (view 57, Figma board 3): press and hold the face, right-click
/// it, or Shift+F10. Three choices, each with one plain line under it.
export function AmanMenu({ copy, face, rtl, reduce, onAsk, onQuiet, onHide, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
      next?.focus();
      e.preventDefault();
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [onClose]);

  const vw = typeof window === 'undefined' ? 390 : window.innerWidth;
  const inlineEnd = rtl ? face.x : vw - face.x - 56;
  const items = [
    { label: copy.menu.ask, sub: copy.menu.askSub, run: onAsk },
    { label: copy.menu.quiet, sub: copy.menu.quietSub, run: onQuiet },
    { label: copy.menu.hide, sub: copy.menu.hideSub, run: onHide },
  ];

  return (
    <m.div
      ref={ref}
      role="menu"
      aria-label={copy.label}
      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? dur.micro : dur.base, ease: ease.out }}
      style={{ width: WIDTH, bottom: (typeof window === 'undefined' ? 800 : window.innerHeight) - face.y + 10, insetInlineEnd: Math.max(16, inlineEnd) }}
      className="fixed z-[61] overflow-hidden rounded-[20px] border border-[var(--color-line)] bg-[var(--color-surface)] p-1.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)]"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => { item.run(); onClose(); }}
          className="flex w-full flex-col items-start gap-0.5 rounded-[14px] px-3.5 py-2.5 text-start hover:bg-[var(--color-surface-2)] focus-visible:bg-[var(--color-surface-2)] focus-visible:outline-none"
        >
          <span className="text-[15px] font-semibold text-[var(--color-ink)]">{item.label}</span>
          <span className="text-[13px] text-[var(--color-ink-dim)]">{item.sub}</span>
        </button>
      ))}
    </m.div>
  );
}
