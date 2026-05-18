'use client';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { LOCALES, LOCALE_NAMES, LOCALE_LABELS_EN, type Locale } from '@/shared/i18n/locales';

interface Props {
  /// Called after the locale changes locally. Use this to persist the new
  /// locale to the backend (settings endpoint) when the user is signed in.
  onChange?: (next: Locale) => void;
  layout?: 'grid' | 'list';
}

export function LanguagePicker({ onChange, layout = 'grid' }: Props) {
  const { locale, setLocale } = useLocale();

  function handle(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    onChange?.(next);
  }

  const wrapperClass =
    layout === 'grid'
      ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5'
      : 'flex flex-col gap-2';

  return (
    <div className={wrapperClass}>
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => handle(l)}
            aria-pressed={active}
            className="relative overflow-hidden text-left pl-4 pr-3.5 py-3 transition-colors"
            style={{
              background: active ? 'rgba(189, 225, 34,0.10)' : 'var(--lp-card)',
              color: 'var(--lp-dark)',
              border: active
                ? '1px solid var(--lp-accent)'
                : '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 3,
            }}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ background: 'var(--lp-accent)' }}
              />
            )}
            <p className="font-sans text-[14px] font-semibold tracking-tight leading-tight">
              {LOCALE_NAMES[l]}
            </p>
            <p
              className="text-[10px] mono mt-0.5 uppercase tracking-[0.12em]"
              style={{ color: 'var(--lp-text-muted)' }}
            >
              {LOCALE_LABELS_EN[l]}
            </p>
          </button>
        );
      })}
    </div>
  );
}
