'use client';
import { api } from '@/core/api';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { CARD_CLASS } from '@/shared/components/Card';
import { useAuth } from '@/shared/hooks/useAuth';
import { setThemePreference, useTheme, type Theme } from '@/shared/hooks/useTheme';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';

/// Dark or Light (view 48, Figma Theme): the only place the theme is chosen,
/// saved on this device at once and on the account for the next one.
export default function ThemePage() {
  const t = useTranslations();
  const { preference, mounted } = useTheme();
  const { address } = useAuth();
  const now: Theme = mounted ? preference : 'dark';
  const options: Array<{ value: Theme; label: string }> = [
    { value: 'dark', label: t.settings.themeDark },
    { value: 'light', label: t.settings.themeLight },
  ];

  function choose(next: Theme) {
    setThemePreference(next);
    // The device already shows it; the account copy follows you to a new device.
    if (address) void api.saveSettings(address, { theme: next }).catch(() => undefined);
  }

  return (
    <AuthGuard gateTag={t.profile.signInGate.tag} gateBody={t.profile.signInGate.body}>
      <ProfileFrame title={t.settings.theme} backHref="/profile">
        <div role="radiogroup" aria-label={t.settings.theme} data-theme-choice className={`${CARD_CLASS} divide-y divide-[var(--line)] px-5`}>
          {options.map((option) => {
            const on = now === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(option.value)}
                className="flex min-h-14 w-full items-center justify-between gap-4 text-start text-[15px] text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
              >
                {option.label}
                <span aria-hidden className={cn('grid size-5 place-items-center rounded-full border-2', on ? 'border-[var(--ink)]' : 'border-[var(--line-strong)]')}>
                  {on ? <span className="size-2.5 rounded-full bg-[var(--ink)]" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </ProfileFrame>
    </AuthGuard>
  );
}
