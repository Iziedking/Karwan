'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useGuide } from '@/shared/guide/GuideProvider';

/// A first-visit note in the same soft green bubble as [[Hint]], shown once per
/// person (owner, 9 Nov 2026, Figma 218:604). Got it is remembered on this
/// device, so it never comes back. Someone who turned the page guide off sees
/// no coach notes either, and a note waits while a tour or the welcome is open,
/// so one thing speaks at a time.
export function CoachNote({ id, children }: { id: string; children: ReactNode }) {
  const t = useTranslations().hint;
  const key = `karwan:coach:${id}`;
  const { disabled, hasActive } = useGuide();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(key) !== '1');
    } catch {
      setShow(false);
    }
  }, [key]);
  if (!show || disabled || hasActive) return null;
  return (
    <div
      role="note"
      data-coach-note={id}
      className="rounded-[16px] border border-[var(--soft-green-edge)] bg-[var(--soft-green)] px-4 py-3.5 text-[14px] font-medium leading-[1.5] text-[var(--ink)]"
    >
      <p>{children}</p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          data-coach-got-it
          onClick={() => {
            try {
              localStorage.setItem(key, '1');
            } catch {
              /* without storage the note simply shows again next visit */
            }
            setShow(false);
          }}
          className="inline-flex min-h-9 items-center rounded-full bg-[var(--action)] px-4 text-[14px] font-bold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--soft-green)]"
        >
          {t.gotIt}
        </button>
      </div>
    </div>
  );
}
