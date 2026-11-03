'use client';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m, useDragControls, type PanInfo } from 'motion/react';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { dur, ease } from '@/shared/motion/tokens';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled])';

/// The frame every money or irreversible action opens in: on a phone a sheet
/// that rises from the bottom over a dimmed screen, with a handle to drag it
/// down; from 768px a card at the end side, centred top to bottom and only as
/// tall as its content, the page dimmed behind it. Focus moves in on open (to
/// `initialFocus`, else the first control), stays trapped, and goes back to
/// whatever opened it. While `busy`, neither Escape nor the backdrop closes
/// it and it cannot be dragged away, so a signing step is never dismissed by
/// accident.
export function ConfirmSheetShell({ open, labelledBy, busy, onClose, initialFocus, children }: {
  open: boolean;
  labelledBy: string;
  busy: boolean;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const reduce = useHydratedReducedMotion();
  const drag = useDragControls();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  const initialFocusRef = useRef(initialFocus);
  onCloseRef.current = onClose;
  busyRef.current = busy;
  initialFocusRef.current = initialFocus;

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => {
      const target =
        initialFocusRef.current?.current ??
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      target?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onCloseRef.current();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus();
    };
  }, [open]);

  if (typeof document === 'undefined') return null;
  const phone = window.matchMedia('(max-width: 767px)').matches;
  const hidden = reduce ? { opacity: 0 } : phone ? { y: '100%' } : { y: 24, opacity: 0 };
  const shown = reduce ? { opacity: 1 } : phone ? { y: 0 } : { y: 0, opacity: 1 };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (!busyRef.current && (info.offset.y > 96 || info.velocity.y > 600)) onCloseRef.current();
  };
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[80] md:flex md:items-center md:justify-end md:p-4" role="presentation">
          <m.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.fast }}
            onClick={() => { if (!busy) onClose(); }}
          />
          <m.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            data-confirm-sheet
            className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-[var(--radius-sheet)] bg-[var(--raised)] px-6 pt-1 pb-[calc(2.125rem+env(safe-area-inset-bottom))] md:relative md:inset-auto md:w-[440px] md:max-h-[calc(100dvh-2rem)] md:rounded-[20px] md:p-6 md:shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={{ duration: reduce ? dur.press : dur.sheet, ease: ease.out }}
            drag={phone && !busy && !reduce ? 'y' : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={onDragEnd}
          >
            <div
              aria-hidden
              data-sheet-handle
              onPointerDown={(event) => { if (!busy) drag.start(event); }}
              className="mx-auto mb-3 flex h-5 w-16 cursor-grab touch-none items-center justify-center md:hidden"
            >
              <span className="h-1 w-9 rounded-[2px] bg-[var(--line-strong)]" />
            </div>
            {children}
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
