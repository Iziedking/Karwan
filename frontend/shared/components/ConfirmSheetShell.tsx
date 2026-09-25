'use client';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { dur, ease } from '@/shared/motion/tokens';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled])';

/// The frame every money or irreversible action opens in: a bottom sheet on a
/// phone, a side drawer from 768px, the page dimmed behind it. Focus moves in on
/// open (to `initialFocus`, else the first control), stays trapped, and goes back
/// to whatever opened it. While `busy`, neither Escape nor the backdrop closes
/// it, so a signing step is never dismissed by accident.
export function ConfirmSheetShell({ open, labelledBy, busy, onClose, initialFocus, children }: {
  open: boolean;
  labelledBy: string;
  busy: boolean;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const reduce = useHydratedReducedMotion();
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
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[80]" role="presentation">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.micro }}
            onClick={() => { if (!busy) onClose(); }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-[16px] bg-[var(--lp-card)] p-6 md:inset-y-0 md:start-auto md:end-0 md:w-[440px] md:max-h-none md:rounded-none"
            initial={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
            transition={{ duration: reduce ? dur.micro : dur.sheet, ease: ease.out }}
          >
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
