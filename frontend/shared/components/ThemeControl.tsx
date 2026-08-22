'use client';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import {
  readPreference,
  setThemePreference,
  useTheme,
  type ThemePreference,
} from '@/shared/hooks/useTheme';

/// The theme control for the signed-in surfaces: the preferences menu, and the
/// nav of the focused flows (sign-in, onboarding) where that menu does not
/// exist yet.
///
/// Three states, not a toggle. The theme runs on Automatic by default now (the
/// machine's own setting, then the hour on its clock), so a two-state toggle
/// could not express where the app actually is: it would show "dark" without
/// saying whether that was chosen or inherited from dusk. Automatic is a state
/// you can see and return to.
///
/// The public landing deliberately has no theme control at all. Nothing there
/// is a workspace, the first screen is a film that is dark in both themes, and
/// a settings affordance in a marketing nav is noise.
const ORDER: ThemePreference[] = ['system', 'light', 'dark'];
const LAYOUT_ID = 'theme-control-active';

export function ThemeControl() {
  const t = useTranslations();
  const reduce = useReducedMotion();
  const { theme, mounted } = useTheme();
  const [preference, setPreference] = useState<ThemePreference>('system');

  // The stored preference is unreadable during SSR, so it is adopted on mount
  // for the same reason `mounted` exists.
  useEffect(() => {
    setPreference(readPreference());
  }, []);

  const label: Record<ThemePreference, string> = {
    system: t.settings.themeSystem,
    light: t.settings.themeLight,
    dark: t.settings.themeDark,
  };

  // Same footprint before and after mount so the row never reflows once the
  // stored preference lands.
  return (
    <div
      role="radiogroup"
      aria-label={t.settings.theme}
      className="inline-flex items-center gap-0.5 rounded-full border border-[var(--color-line)] p-0.5"
    >
      {ORDER.map((value) => {
        const active = mounted && preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            // Automatic resolves to one of the other two, and which one is
            // worth saying out loud: "Automatic, dark right now".
            aria-label={
              value === 'system' && active && mounted
                ? `${label.system}, ${theme === 'dark' ? label.dark : label.light}`
                : label[value]
            }
            onClick={() => {
              setThemePreference(value);
              setPreference(value);
            }}
            className="relative inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            style={{ color: active ? 'var(--color-ink)' : 'var(--color-ink-faint)' }}
          >
            {active && (
              <motion.span
                layoutId={LAYOUT_ID}
                aria-hidden
                className="absolute inset-0 rounded-full bg-[var(--color-surface-2)]"
                transition={reduce ? { duration: 0 } : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <span className="relative">
              {value === 'system' ? <AutoIcon /> : value === 'light' ? <SunIcon /> : <MoonIcon />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/// Half-filled disc: the state that is both, resolved by the light outside.
function AutoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2.8a5.2 5.2 0 0 0 0 10.4z" fill="currentColor" />
    </svg>
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
