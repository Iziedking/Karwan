'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import {
  readPreference,
  setThemePreference,
  useTheme,
  type ThemePreference,
} from '@/shared/hooks/useTheme';

/// The theme control, for surfaces where there is no other one.
///
/// There is no nav toggle any more: the app runs on Automatic, which reads the
/// machine's own dark setting and, failing that, the hour on its clock. This
/// picker exists so that decision is visible and reversible, not so it has to
/// be made. Automatic is listed first because it is where every device starts.
///
/// Shows all three states rather than cycling through them. A toggle asks the
/// user to work out which state the icon represents; a picker shows them where
/// they are and what the alternatives are.
export function ThemePicker() {
  const t = useTranslations();
  const { theme, mounted } = useTheme();
  const [preference, setPreference] = useState<ThemePreference>('system');

  // The stored preference is unreadable during SSR, so it is adopted on mount
  // for the same reason `mounted` exists.
  useEffect(() => {
    setPreference(readPreference());
  }, []);

  function choose(next: ThemePreference) {
    setThemePreference(next);
    setPreference(next);
  }

  const options: { value: ThemePreference; icon: React.ReactNode; label: string }[] = [
    { value: 'system', icon: <AutoIcon />, label: t.settings.themeSystem },
    { value: 'light', icon: <SunIcon />, label: t.settings.themeLight },
    { value: 'dark', icon: <MoonIcon />, label: t.settings.themeDark },
  ];

  return (
    <div className="inline-flex flex-wrap items-center gap-2.5">
      <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
        {t.settings.theme}
      </span>
      <div role="group" aria-label={t.settings.theme} className="inline-flex gap-1.5">
        {options.map((o) => {
          // Before mount nothing is marked current. Painting one as active
          // would be a guess that flips under anyone not on the default.
          const active = mounted && preference === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              aria-pressed={active}
              className="inline-flex min-h-11 items-center gap-1.5 px-3 py-2 mono text-[10px] uppercase tracking-[0.12em] font-bold transition-[background-color,border-color,color]"
              style={{
                background: active ? 'rgba(175, 201, 91, 0.10)' : 'var(--lp-card)',
                color: active ? 'var(--lp-dark)' : 'var(--lp-text-sub)',
                border: active
                  ? '1px solid var(--lp-accent)'
                  : '1px solid var(--lp-outline)',
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              {o.icon}
              {o.label}
              {/* Automatic resolves to one of the other two, and which one is
                  worth stating: the row otherwise reads as three equal choices
                  with no clue what the active one produced. */}
              {active && o.value === 'system' && mounted && (
                <span aria-hidden className="text-[var(--lp-text-muted)]">
                  {theme === 'dark' ? '· ' + t.settings.themeDark : '· ' + t.settings.themeLight}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AutoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 3a5 5 0 0 0 0 10z" fill="currentColor" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
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
