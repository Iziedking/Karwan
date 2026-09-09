'use client';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import {
  setThemePreference,
  useTheme,
  type ThemePreference,
} from '@/shared/hooks/useTheme';

/// The single theme control lives in All settings. It deliberately switches
/// between explicit light and dark choices, so the control always tells the
/// user what the next click will do.
export function ThemeControl({ onChange }: { onChange?: (next: ThemePreference) => void }) {
  const t = useTranslations();
  const { theme, mounted } = useTheme();

  const isDark = mounted ? theme === 'dark' : true;
  const next = isDark ? 'light' : 'dark';
  const nextLabel = next === 'dark' ? t.settings.themeDark : t.settings.themeLight;
  const currentLabel = isDark ? t.settings.themeDark : t.settings.themeLight;

  return (
    <button
      type="button"
      aria-label={`${t.settings.theme}: ${currentLabel}. ${nextLabel}`}
      title={`${t.settings.theme}: ${nextLabel}`}
      onClick={() => {
        const nextPreference: ThemePreference = isDark ? 'light' : 'dark';
        setThemePreference(nextPreference);
        onChange?.(nextPreference);
      }}
      className="inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full border border-[var(--color-line)] text-[var(--color-ink-dim)] transition-[background-color,color,border-color] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
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
