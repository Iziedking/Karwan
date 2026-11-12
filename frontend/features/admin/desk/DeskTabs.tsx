'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { tabsFor } from '@/features/admin/adminNavigation';
import { deskMe, useDesk } from './deskContext';

export interface DeskTabItem {
  key: string;
  label: string;
  count?: number;
}

/// Tabs under a page title, underlined when open.
export function DeskTabBar({ tabs, active, onChange }: { tabs: DeskTabItem[]; active: string; onChange: (key: string) => void }) {
  return (
    <div role="tablist" className="flex gap-[22px] overflow-x-auto border-b border-[var(--d-line)]">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-[13px] font-medium transition ${on ? 'border-[var(--d-text)] text-[var(--d-text)]' : 'border-transparent text-[var(--d-text-2)] hover:text-[var(--d-text)]'}`}
          >
            {t.label}
            {t.count !== undefined && <span className="text-[12px] font-normal text-[var(--d-text-3)]">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/// A page made of older pages, one tab each; a teammate sees only the parts
/// their ticks open, and the address keeps the open tab (?tab=).
export function DeskTabs({ parts }: { parts: Record<string, ComponentType> }) {
  const { me } = useDesk();
  const pathname = usePathname();
  const router = useRouter();
  const tabs = tabsFor(deskMe(me), pathname).filter((t) => parts[t.key]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('tab');
    setActive(tabs.some((t) => t.key === asked) ? asked : tabs[0]?.key ?? null);
    // Read once per page; later changes come from the tab bar.
  }, [pathname]);

  if (!active) return null;
  const Part = parts[active];
  function choose(key: string) {
    setActive(key);
    router.replace(`${pathname}?tab=${key}`, { scroll: false });
  }

  return (
    <div className="space-y-5">
      {tabs.length > 1 && <DeskTabBar tabs={tabs} active={active} onChange={choose} />}
      {Part && <Part />}
    </div>
  );
}
