'use client';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { setThemePreference, useTheme, type ThemePreference } from '@/shared/hooks/useTheme';

const nextPreference: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export function ThemeControl({ onChange }: { onChange?: (next: ThemePreference) => void }) {
  const t = useTranslations();
  const { preference, mounted } = useTheme();

  const currentLabel = preference === 'system'
    ? t.settings.themeSystem
    : preference === 'light'
      ? t.settings.themeLight
      : t.settings.themeDark;

  return (
    <button
      type="button"
      aria-label={`${t.settings.theme}: ${mounted ? currentLabel : t.settings.themeDark}`}
      data-theme-preference={mounted ? preference : undefined}
      onClick={() => {
        const next = nextPreference[preference];
        setThemePreference(next);
        onChange?.(next);
      }}
      className="inline-flex h-11 min-h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-ink)] transition-[background-color,color,border-color] hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
    >
      {mounted && preference === 'light' ? <SunIcon /> : mounted && preference === 'dark' ? <MoonIcon /> : <AutoIcon />}
    </button>
  );
}

function AutoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.8a5.2 5.2 0 0 0 0 10.4z" fill="currentColor" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13 8.5A5.5 5.5 0 0 1 7.5 3a5.5 5.5 0 1 0 5.5 5.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
