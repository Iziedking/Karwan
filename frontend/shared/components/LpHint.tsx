'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Phantom-grade info tooltip for the `--lp-*` surfaces (profile, app, buyer,
/// seller). A small info glyph reveals one short line of context on hover, tap,
/// or focus, so a card can stay quiet and still explain itself on demand. Renders
/// through a portal so a card's overflow:hidden and rounded corners never clip
/// it. Instrument-palette twin: [[Hint]] (do not use that one on lp surfaces).
export function LpHint({
  children,
  side = 'top',
  align = 'start',
}: {
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
}) {
  const t = useTranslations().hint;
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const PADDING = 8;
  const WIDTH = 244;

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const h = tooltipRef.current?.getBoundingClientRect().height ?? 60;
    let left =
      align === 'start'
        ? rect.left
        : align === 'end'
          ? rect.right - WIDTH
          : rect.left + rect.width / 2 - WIDTH / 2;
    const maxLeft = window.innerWidth - WIDTH - PADDING;
    if (left > maxLeft) left = maxLeft;
    if (left < PADDING) left = PADDING;
    let top = side === 'top' ? rect.top - h - PADDING : rect.bottom + PADDING;
    if (side === 'top' && top < PADDING) top = rect.bottom + PADDING;
    if (side === 'bottom' && top + h > window.innerHeight - PADDING) top = rect.top - h - PADDING;
    setPos({ top: top + window.scrollY, left: left + window.scrollX });
  }, [open, align, side, children]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const closeOnOutside = (e: PointerEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (tooltipRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('pointerdown', closeOnOutside, true);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('pointerdown', closeOnOutside, true);
    };
  }, [open]);

  const trigger = (
    <span
      ref={triggerRef}
      role="button"
      tabIndex={0}
      aria-label={t.triggerAria}
      aria-expanded={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (tooltipRef.current?.contains(e.relatedTarget as Node)) return;
        setOpen(false);
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((v) => !v);
        }
        if (e.key === 'Escape') setOpen(false);
      }}
      className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] transition-colors cursor-help align-middle"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="block">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="8" cy="5" r="0.85" fill="currentColor" />
        <path d="M8 7.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </span>
  );

  const tooltip =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="fixed z-[200] px-3 py-2 text-[11px] leading-snug pointer-events-none normal-case tracking-normal font-normal"
            style={{
              top: pos.top - window.scrollY,
              left: pos.left - window.scrollX,
              width: WIDTH,
              background: 'var(--lp-dark)',
              color: 'var(--lp-light)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 2,
              boxShadow: '0 12px 32px -16px rgba(0,0,0,0.5)',
            }}
          >
            {children}
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
