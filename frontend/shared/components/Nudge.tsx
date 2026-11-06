'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { nudgeCopy } from '@/shared/i18n/messages/nudge';
import { dur, ease } from '@/shared/motion/tokens';

/// How long a nudge stays before it fades by itself.
export const NUDGE_MS = 6000;

/// A short note that floats above the page, readable on a see-through card,
/// and fades out by itself (owner notes, 4 Nov 2026). It replaces explainer
/// lines under buttons. Each one shows once per visit: `id` remembers that it
/// was shown, so moving between pages does not repeat it.
export function Nudge({ id, lines }: { id: string; lines: string[] }) {
  const { locale } = useLocale();
  const reduce = useHydratedReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const key = `karwan:nudge:${id}`;

  // Decided once per mount, so a development double run of the effect does not hide it.
  const show = useRef<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
    if (show.current === null) {
      try {
        show.current = sessionStorage.getItem(key) !== '1';
        sessionStorage.setItem(key, '1');
      } catch {
        show.current = true;
      }
    }
    if (!show.current) return;
    setOpen(true);
    const timer = window.setTimeout(() => setOpen(false), NUDGE_MS);
    return () => window.clearTimeout(timer);
  }, [key]);

  if (!mounted || lines.length === 0) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <m.div
          role="status"
          data-nudge={id}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? dur.micro : dur.base, ease: ease.out }}
          className="guide-voice fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-[420px] items-start gap-3 rounded-[16px] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md lg:bottom-8"
        >
          <div className="min-w-0 flex-1 space-y-1">
            {lines.map((line) => (
              <p key={line} className="text-[15px] font-semibold leading-snug text-[var(--ink)]">{line}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={nudgeCopy[locale].close}
            className="-me-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--ash)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          >
            <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </m.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
