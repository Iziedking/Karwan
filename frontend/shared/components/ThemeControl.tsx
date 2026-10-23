'use client';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { setThemePreference, useTheme, type ThemePreference } from '@/shared/hooks/useTheme';
import { Tooltip } from './Tooltip';

const nextPreference: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

/// One theme cycle for every place that offers it: automatic, light, dark.
export function useThemeCycle(onChange?: (next: ThemePreference) => void) {
  const t = useTranslations();
  const { preference, mounted } = useTheme();
  const current = mounted ? preference : 'system';
  const currentLabel = current === 'system'
    ? t.settings.themeSystem
    : current === 'light'
      ? t.settings.themeLight
      : t.settings.themeDark;
  return {
    current,
    title: t.settings.theme,
    label: `${t.settings.theme}: ${currentLabel}`,
    cycle: () => {
      const next = nextPreference[preference];
      setThemePreference(next);
      onChange?.(next);
    },
  };
}

export function ThemeIcon({ preference }: { preference: ThemePreference }) {
  return preference === 'light' ? <SunIcon /> : preference === 'dark' ? <MoonIcon /> : <AutoIcon />;
}

/// The top bar's theme button: the mark alone, no ring, a full 44px target.
export function ThemeControl({ onChange, className = '' }: { onChange?: (next: ThemePreference) => void; className?: string }) {
  const theme = useThemeCycle(onChange);
  return (
    <Tooltip label={theme.label} align="end" className={className}>
    <button
      type="button"
      aria-label={theme.label}
      data-theme-preference={theme.current}
      onClick={theme.cycle}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-dim)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
    >
      <ThemeIcon preference={theme.current} />
    </button>
    </Tooltip>
  );
}

function AutoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.8a5.2 5.2 0 0 0 0 10.4z" fill="currentColor" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
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
