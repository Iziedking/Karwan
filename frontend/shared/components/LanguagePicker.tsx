'use client';

import { isLocale, LOCALES, LOCALE_NAMES, type Locale } from '@/shared/i18n/locales';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';

/** Small, native language control for public and focused surfaces. */
export function LanguagePicker() {
  const { locale, setLocale } = useLocale();
  const label = useTranslations().settings.language;

  return (
    <label className="group relative inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[var(--color-line)] px-3 text-[var(--color-ink)] transition-colors hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface)] focus-within:border-[var(--lp-accent)] focus-within:ring-2 focus-within:ring-[var(--lp-accent)] sm:w-[112px]">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 7h9M8 4v3c0 4-1.6 7.4-4 9m2-4c1.7 1.8 3.7 3 6 3M14 5l6 14m-2-5h-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hidden font-sans text-[14px] font-semibold uppercase tracking-[0.02em] sm:inline">{locale}</span>
      <svg className="ms-auto hidden sm:block" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select
        aria-label={label}
        value={locale}
        onChange={(event) => {
          const next = event.target.value;
          if (isLocale(next)) setLocale(next as Locale);
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
        style={{ color: '#172033', backgroundColor: '#ffffff' }}
      >
        {LOCALES.map((option) => (
          <option key={option} value={option} style={{ color: '#172033', backgroundColor: '#ffffff' }}>
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
