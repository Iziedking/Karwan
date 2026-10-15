'use client';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/shared/i18n/locales';

interface Props {
  /// Called after the locale changes locally. Use this to persist the new
  /// locale to the backend (settings endpoint) when the user is signed in.
  onChange?: (next: Locale) => void;
}

/// One list, one row per language in its own script, the English name under
/// it when that differs, and a check on the current one.
export function LanguagePicker({ onChange }: Props) {
  const { locale, setLocale } = useLocale();
  const t = useTranslations();
  const lp = t.languagePicker;

  function handle(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    onChange?.(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={t.settings.language}
      className="divide-y divide-[var(--lp-border-light)] overflow-hidden rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]"
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        const english = lp.languageLabels[l];
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => handle(l)}
            className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
          >
            <span lang={l} className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug text-[var(--lp-dark)]">{LOCALE_NAMES[l]}</span>
              {english !== LOCALE_NAMES[l] ? (
                <span lang="en" className="block text-[14px] font-medium text-[var(--ink-secondary)]">{english}</span>
              ) : null}
            </span>
            {active ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-[var(--lp-accent-on-light)]">
                <path d="m5 12 5 5 9-10" />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
