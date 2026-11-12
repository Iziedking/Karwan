'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { AdminDeskNetwork } from '@/core/api';
import { sidebarFor, type DeskBadge } from '@/features/admin/adminNavigation';
import { AmountsIn } from './AmountsIn';
import { DeskIcon } from './deskIcons';
import { deskMe, useDesk } from './deskContext';

export type DeskCounts = Partial<Record<DeskBadge, number>>;

function isActive(pathname: string, href: string, all: string[]): boolean {
  if (pathname === href) return true;
  if (href === '/admin' || !pathname.startsWith(`${href}/`)) return false;
  // A longer page address that also matches wins (Team room under Support).
  return !all.some((other) => other !== href && other.startsWith(`${href}/`) && (pathname === other || pathname.startsWith(`${other}/`)));
}

export function DeskSidebar({ pathname, counts, onSwitch, onNavigate }: {
  pathname: string;
  counts: DeskCounts;
  onSwitch: (network: AdminDeskNetwork) => void;
  onNavigate?: () => void;
}) {
  const { me, network } = useDesk();
  const groups = sidebarFor(deskMe(me));
  const all = groups.flatMap((g) => g.items.map((i) => i.href));
  const [menu, setMenu] = useState(false);
  const other: AdminDeskNetwork = network === 'mainnet' ? 'testnet' : 'mainnet';

  return (
    <div className="flex h-full flex-col gap-0.5 px-3 py-3.5">
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-expanded={menu}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--d-hover)]"
        >
          <img src="/karwan-app-icon.svg" alt="" className="size-7 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[var(--d-text)]">Karwan Desk</span>
            <span className="block text-[11px] text-[var(--d-text-3)]">{network === 'mainnet' ? 'Mainnet · real money' : 'Testnet · test money'}</span>
          </span>
          <ChevronDown aria-hidden="true" strokeWidth={1.5} className="size-3.5 text-[var(--d-text-3)]" />
        </button>
        {menu && (
          <div className="absolute inset-x-0 top-full z-40 mt-1 rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-1.5 shadow-lg">
            <p className="px-2 py-1.5 text-[12px] text-[var(--d-text-2)]">You are on the {network} desk.</p>
            <button
              type="button"
              onClick={() => { setMenu(false); onSwitch(other); }}
              className="w-full rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-[var(--d-text)] hover:bg-[var(--d-hover)]"
            >
              Sign in to the {other} desk
            </button>
          </div>
        )}
      </div>

      <nav aria-label="Desk pages" className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {groups.map((group, i) => (
          <div key={group.label}>
            {i > 0 && <p className="px-2 pb-1 pt-3 text-[11px] font-medium text-[var(--d-text-3)]">{group.label}</p>}
            {group.items.map((item) => {
              const active = isActive(pathname, item.href, all);
              const count = item.badge ? counts[item.badge] : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`mt-0.5 flex items-center gap-2.5 rounded-md px-2 py-[5px] text-[13px] transition ${active ? 'bg-[var(--d-hover)] font-semibold text-[var(--d-text)]' : 'font-medium text-[var(--d-text-2)] hover:bg-[var(--d-hover)] hover:text-[var(--d-text)]'}`}
                >
                  <DeskIcon name={item.icon} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {count ? <span className="text-[12px] font-medium text-[var(--d-text-3)]">{count}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-[var(--d-line)] pt-2">
        <AmountsIn />
      </div>
    </div>
  );
}
