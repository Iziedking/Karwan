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
  const leaveTimer = useRef(0);
  // Focus goes back to the (i) after Got it; that focus must not reopen the note.
  const quietFocus = useRef(false);
  const closeToTrigger = () => { setOpen(false); quietFocus.current = true; triggerRef.current?.focus({ preventScroll: true }); };
  const [measured, setMeasured] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; arrow: number; below: boolean } | null>(null);

  const PADDING = 10;
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
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') { window.clearTimeout(leaveTimer.current); setOpen(true); } }}
      // A short grace lets the mouse reach the note's Got it before it closes.
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') leaveTimer.current = window.setTimeout(() => setOpen(false), 200); }}
      onFocus={() => { if (quietFocus.current) { quietFocus.current = false; return; } setOpen(true); }}
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
      className={`group inline-flex w-11 h-11 -m-3 items-center justify-center rounded-full focus:outline-none cursor-help${glow ? ' hint-glow' : ''}`}
    >
      {/* The (i) turns soft green while its note is open (owner, 7 Nov 2026). */}
      <span
        data-hint-dot
        className={`inline-flex size-7 items-center justify-center rounded-full border transition-colors duration-150 group-focus-visible:ring-2 group-focus-visible:ring-[var(--ink)] ${
          open
            ? 'border-[var(--soft-green-edge)] bg-[var(--soft-green-chip)] text-[var(--soft-green-ink)]'
            : 'border-transparent text-[var(--ink-secondary)] group-hover:text-[var(--ink)]'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="block">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    </span>
  );

  const tooltip =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            data-hint-tip
            // A soft green bubble whose tail points at the (i) (owner, 7 Nov 2026, Figma 202:637).
            onPointerEnter={() => window.clearTimeout(leaveTimer.current)}
            onKeyDown={(e) => { if (e.key === 'Escape') closeToTrigger(); }}
            className="fixed z-[200] rounded-[16px] border border-[var(--soft-green-edge)] bg-[var(--soft-green)] px-4 py-3.5 text-start text-[14px] font-medium leading-[1.5] text-[var(--ink)] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.18)] normal-case tracking-normal"
            style={{
              top: pos.top - window.scrollY,
              left: pos.left - window.scrollX,
              width: pos.width,
            }}
          >
            {children}
            {/* Every note closes with Got it (owner, 9 Nov 2026, Figma 218:570). */}
            <span className="mt-3 flex justify-end">
              <button
                type="button"
                data-hint-got-it
                onClick={(e) => { e.stopPropagation(); closeToTrigger(); }}
                className="min-h-9 rounded-full bg-[var(--action)] px-4 text-[14px] font-bold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              >
                {t.gotIt}
              </button>
            </span>
            <span
              aria-hidden
              className={`absolute size-3 rotate-45 rounded-[2px] bg-[var(--soft-green)] ${pos.below ? '-top-[7px]' : '-bottom-[7px]'}`}
              // Physical sides on purpose: the bubble is placed in screen pixels, in Arabic too.
              style={{
                left: pos.arrow - 6,
                ...(pos.below
                  ? { borderTop: '1px solid var(--soft-green-edge)', borderLeft: '1px solid var(--soft-green-edge)' }
                  : { borderBottom: '1px solid var(--soft-green-edge)', borderRight: '1px solid var(--soft-green-edge)' }),
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
