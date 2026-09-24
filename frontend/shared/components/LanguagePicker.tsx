'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { isRtl, LOCALES, LOCALE_NAMES } from '@/shared/i18n/locales';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';

/** Language menu for public and focused surfaces: one button, a short list,
 *  closed by a choice, Escape, Tab or a click outside. */
export function LanguagePicker() {
  const { locale, setLocale } = useLocale();
  const label = useTranslations().settings.language;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    root?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onBlur={(event) => {
        if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${LOCALE_NAMES[locale]}`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-[10px] border border-[var(--color-line)] px-3 text-[var(--color-ink)] transition-colors hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] sm:w-[112px]"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7h9M8 4v3c0 4-1.6 7.4-4 9m2-4c1.7 1.8 3.7 3 6 3M14 5l6 14m-2-5h-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hidden font-sans text-[14px] font-semibold uppercase tracking-[0.02em] sm:inline">{locale}</span>
        <svg className={`ms-auto hidden transition-transform duration-200 sm:block ${open ? 'rotate-180' : ''}`} width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <ul
          id={listId}
          aria-label={label}
          className="absolute end-0 top-full z-50 mt-2 w-[200px] rounded-[12px] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-1.5"
        >
          {LOCALES.map((option) => {
            const current = option === locale;
            return (
              <li key={option}>
                <button
                  type="button"
                  lang={option}
                  dir={isRtl(option) ? 'rtl' : 'ltr'}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => {
                    setOpen(false);
                    buttonRef.current?.focus();
                    if (!current) setLocale(option);
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[8px] px-3 text-start text-[14px] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                >
                  <span>{LOCALE_NAMES[option]}</span>
                  {current ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
