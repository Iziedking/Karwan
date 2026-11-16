'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { agentSwitchesCopy } from '@/shared/i18n/messages/agentSwitches';
import { cn } from '@/shared/utils/cn';

export const SETTINGS_GROUPS = ['general', 'money', 'agent'] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

/// The group Settings is showing, kept in the address so a link can open one
/// (view 87). Anything else reads as General.
export function useSettingsGroup(): SettingsGroup {
  const asked = useSearchParams().get('group');
  return SETTINGS_GROUPS.find((g) => g === asked) ?? 'general';
}

/// General, Money and Agent as one row of tabs. Choosing one replaces the
/// address, so Back leaves Settings instead of walking the tabs.
export function SettingsGroups({ active }: { active: SettingsGroup }) {
  const { locale } = useLocale();
  const copy = agentSwitchesCopy[locale] ?? agentSwitchesCopy.en;
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div role="tablist" aria-label={copy.groupsAria} className="grid grid-cols-3 gap-1 rounded-[20px] bg-[var(--tint)] p-1">
      {SETTINGS_GROUPS.map((group) => {
        const current = group === active;
        return (
          <button
            key={group}
            type="button"
            role="tab"
            id={`settings-tab-${group}`}
            aria-selected={current}
            aria-controls="settings-group-panel"
            onClick={() => router.replace(group === 'general' ? pathname : `${pathname}?group=${group}`, { scroll: false })}
            className={cn(
              'min-h-11 rounded-full px-2 text-[14px] font-semibold transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--action)]',
              current ? 'bg-[var(--ink)] text-[var(--canvas)]' : 'text-[var(--ink)] hover:bg-[var(--line)]',
            )}
          >
            {copy.groups[group]}
          </button>
        );
      })}
    </div>
  );
}
