'use client';

import Link from 'next/link';
import { phoneTabs } from '@/features/admin/adminNavigation';
import { DeskIcon } from './deskIcons';
import { deskMe, useDesk } from './deskContext';
import type { DeskCounts } from './DeskSidebar';

/// The phone's bottom bar for a support teammate (view 79, frame 272:768):
/// Support, Team room and Waiting for you, one thumb away. Hidden from 768 px.
export function DeskTabBar({ pathname, counts }: { pathname: string; counts: DeskCounts }) {
  const { me } = useDesk();
  const tabs = phoneTabs(deskMe(me));
  if (tabs.length === 0) return null;

  return (
    <nav aria-label="Desk tabs" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-[var(--d-line)] bg-[var(--d-side)] pb-[env(safe-area-inset-bottom)] md:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        const count = tab.badge ? counts[tab.badge] : undefined;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-[var(--d-text)]' : 'text-[var(--d-text-3)]'}`}
          >
            <span className="relative">
              <DeskIcon name={tab.icon} className="size-5" />
              {count ? <span className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-[var(--d-red)] px-1 text-center text-[10px] font-semibold leading-4 text-white">{count}</span> : null}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
