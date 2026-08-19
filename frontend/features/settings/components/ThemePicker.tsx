'use client';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useTheme, type Theme } from '@/shared/hooks/useTheme';

/// An explicit two-option theme control, for surfaces where the nav's icon
/// toggle is not available.
///
/// Onboarding suppresses the nav's control cluster (`showFullChrome` is false
/// there, deliberately, so the wizard stays focused), which left the theme
/// unreachable for the whole of first run. That is the worst place to lose it:
/// a new user meeting the product in a theme they cannot change, on the exact
/// screens where they have to read and fill forms.
///
/// Shows both states rather than toggling between them, matching LanguagePicker
/// beside it. A toggle asks the user to work out which state the icon represents;
/// a picker shows them where they are and what the alternative is.
export function ThemePicker() {
  const t = useTranslations();
  const { theme, setTheme, mounted } = useTheme();

  // Reuses the settings vocabulary rather than minting its own. These strings are
  // already translated in all five locales, and a second set would drift.
  const options: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <SunIcon />, label: t.settings.themeLight },
    { value: 'dark', icon: <MoonIcon />, label: t.settings.themeDark },
  ];

  return (
    <div className="inline-flex items-center gap-2.5">
      <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
        {t.settings.theme}
      </span>
      <div role="group" aria-label={t.settings.theme} className="inline-flex gap-1.5">
        {options.map((o) => {
          // Before mount the stored theme is unreadable, so neither option is
          // marked current. Painting one as active would be a guess that flips
          // under anyone whose theme is not the default.
          const active = mounted && theme === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setTheme(o.value)}
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
            </button>
          );
        })}
      </div>
    </div>
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
