'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Tooltip that renders via portal so parent overflow:hidden / rounded
/// corners can never clip it. Coordinates are recomputed on every show so
/// the tooltip stays anchored to the trigger after layout shifts.
export function Hint({
  children,
  side = 'top',
  align = 'start',
  glow = false,
}: {
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  /// Adds a subtle pulsing glow to the trigger so a collapsed explanation reads
  /// as tappable at a glance. Off by default.
  glow?: boolean;
}) {
  const t = useTranslations().hint;
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const pointer = useRef<string>('');
  const [measured, setMeasured] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; arrow: number; below: boolean } | null>(null);

  const PADDING = 8;
  const tooltipWidth = () => Math.min(300, window.innerWidth - PADDING * 2);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tip = tooltipRef.current;
    // The first time it opens the bubble has not drawn yet: place it again once its height is known.
    const frame = tip ? 0 : requestAnimationFrame(() => setMeasured((n) => n + 1));
    const tooltipHeight = tip?.getBoundingClientRect().height ?? 60;
    const width = tooltipWidth();
    let left =
      align === 'start'
        ? rect.left
        : align === 'end'
          ? rect.right - width
          : rect.left + rect.width / 2 - width / 2;
    // Auto-flip horizontally so the tooltip never escapes the viewport.
    const maxLeft = window.innerWidth - width - PADDING;
    if (left > maxLeft) left = maxLeft;
    if (left < PADDING) left = PADDING;
    let top = side === 'top' ? rect.top - tooltipHeight - PADDING : rect.bottom + PADDING;
    // Auto-flip vertically when the chosen side would go off screen.
    if (side === 'top' && top < PADDING) top = rect.bottom + PADDING;
    if (side === 'bottom' && top + tooltipHeight > window.innerHeight - PADDING) {
      top = rect.top - tooltipHeight - PADDING;
    }
    const below = top > rect.top;
    // The pointer aims at the trigger's centre, kept inside the bubble's rounded corners.
    const arrow = Math.min(width - 20, Math.max(20, rect.left + rect.width / 2 - left));
    setPos({ top: top + window.scrollY, left: left + window.scrollX, width, arrow, below });
    return () => cancelAnimationFrame(frame);
  }, [open, align, side, children, measured]);

  // Follow the trigger when the page scrolls or resizes (focusing an (i) below
  // the fold scrolls it into view, which used to close the note at once).
  // A tap outside closes it, so touch users need not find the trigger again.
  useEffect(() => {
    if (!open) return;
    const follow = () => setMeasured((n) => n + 1);
    const closeOnOutsideTap = (e: PointerEvent) => {
      if (!triggerRef.current) return;
      if (triggerRef.current.contains(e.target as Node)) return;
      if (tooltipRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    window.addEventListener('pointerdown', closeOnOutsideTap, true);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      window.removeEventListener('pointerdown', closeOnOutsideTap, true);
    };
  }, [open]);

  const trigger = (
    <span
      ref={triggerRef}
      role="button"
      tabIndex={0}
      aria-label={t.triggerAria}
      aria-expanded={open}
      // Hover is for a mouse only: a tap also fires a hover, which would open and then close it.
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // Don't close if focus moves into the tooltip itself.
        if (tooltipRef.current?.contains(e.relatedTarget as Node)) return;
        setOpen(false);
      }}
      onPointerDown={(e) => {
        pointer.current = e.pointerType;
      }}
      onClick={(e) => {
        // A mouse already opened it on hover, so its click keeps it open; a tap toggles.
        e.preventDefault();
        e.stopPropagation();
        if (pointer.current === 'mouse') setOpen(true);
        else setOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((v) => !v);
        }
        if (e.key === 'Escape') setOpen(false);
      }}
      className={`inline-flex w-11 h-11 -m-3 items-center justify-center rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink)] focus:outline-none focus-visible:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ink)] transition-colors duration-150 cursor-help${glow ? ' hint-glow' : ''}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="block">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );

  const tooltip =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            data-hint-tip
            className="fixed z-[200] rounded-[12px] border border-[var(--line-strong)] bg-[var(--raised)] px-3.5 py-3 text-start text-[14px] font-medium leading-[1.5] text-[var(--ink)] pointer-events-none normal-case tracking-normal"
            style={{
              top: pos.top - window.scrollY,
              left: pos.left - window.scrollX,
              width: pos.width,
            }}
          >
            {children}
            <span
              aria-hidden
              className={`absolute size-2.5 rotate-45 bg-[var(--raised)] ${pos.below ? '-top-[6px]' : '-bottom-[6px]'}`}
              // Physical sides on purpose: the bubble is placed in screen pixels, in Arabic too.
              style={{
                left: pos.arrow - 5,
                ...(pos.below
                  ? { borderTop: '1px solid var(--line-strong)', borderLeft: '1px solid var(--line-strong)' }
                  : { borderBottom: '1px solid var(--line-strong)', borderRight: '1px solid var(--line-strong)' }),
              }}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <span className="relative inline-flex items-center align-middle">
      {trigger}
      {tooltip}
    </span>
  );
}
