'use client';
import { useTheme } from '@/shared/hooks/useTheme';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The compact nav control. Read/persist/apply lives in useTheme so this and the
/// onboarding picker cannot drift apart, and so both stay aligned with the
/// pre-paint script in app/layout.tsx.
export function ThemeToggle() {
  const a11y = useTranslations().a11y;
  const { theme, toggle, mounted } = useTheme();

  if (!mounted) return <div className="w-11 h-11" aria-hidden />;

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label={a11y.toggleTheme}
      // Resting border is line-strong, not line: at 8% white the outline measured
      // 1.2:1 against the dark nav, so the control read as a floating icon with no
      // edge at all.
      className="w-11 h-11 grid place-items-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink-dim)] transition-colors"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
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
