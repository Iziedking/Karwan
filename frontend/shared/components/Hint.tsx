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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const PADDING = 8;
  const TOOLTIP_WIDTH = 256; // matches Tailwind w-64

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tip = tooltipRef.current;
    const tooltipHeight = tip?.getBoundingClientRect().height ?? 60;
    let left =
      align === 'start'
        ? rect.left
        : align === 'end'
          ? rect.right - TOOLTIP_WIDTH
          : rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    // Auto-flip horizontally so the tooltip never escapes the viewport.
    const maxLeft = window.innerWidth - TOOLTIP_WIDTH - PADDING;
    if (left > maxLeft) left = maxLeft;
    if (left < PADDING) left = PADDING;
    let top = side === 'top' ? rect.top - tooltipHeight - PADDING : rect.bottom + PADDING;
    // Auto-flip vertically when the chosen side would go off screen.
    if (side === 'top' && top < PADDING) top = rect.bottom + PADDING;
    if (side === 'bottom' && top + tooltipHeight > window.innerHeight - PADDING) {
      top = rect.top - tooltipHeight - PADDING;
    }
    setPos({ top: top + window.scrollY, left: left + window.scrollX });
  }, [open, align, side, children]);

  // Close on outside scroll/resize so the tooltip never drifts off its anchor.
  // Also close on outside tap so touch users can dismiss without finding the
  // trigger again.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const closeOnOutsideTap = (e: PointerEvent) => {
      if (!triggerRef.current) return;
      if (triggerRef.current.contains(e.target as Node)) return;
      if (tooltipRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('pointerdown', closeOnOutsideTap, true);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
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
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // Don't close if focus moves into the tooltip itself.
        if (tooltipRef.current?.contains(e.relatedTarget as Node)) return;
        setOpen(false);
      }}
      onClick={(e) => {
        // Touch devices don't fire hover events. Tap toggles.
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
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:text-[var(--color-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 transition-colors duration-150 cursor-help${glow ? ' hint-glow' : ''}`}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="block">
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
            className="fixed z-[200] w-64 px-3 py-2 rounded-md bg-[var(--color-ink)] text-[var(--color-bg)] text-[11px] leading-snug pointer-events-none shadow-lg normal-case tracking-normal font-normal"
            style={{
              top: pos.top - window.scrollY,
              left: pos.left - window.scrollX,
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
