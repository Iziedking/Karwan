'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Search, X } from 'lucide-react';
import type { AdminDeskNetwork } from '@/core/api';
import { AdminWalletControl } from '@/features/admin/AdminWalletControl';
import { DESK_COLOURS, useDesk } from './deskContext';
import { DeskSidebar } from './DeskSidebar';
import { useDeskHome } from './useDeskHome';
import { CommandMenu } from './CommandMenu';

const STRIP = {
  testnet: { line: 'Testnet. Test money only; nothing here moves real funds.', bg: '#16202B', fg: 'var(--d-blue)' },
  mainnet: { line: 'Mainnet. Every amount on this desk is real money.', bg: '#2B2210', fg: '#F0C266' },
};

function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'K';
}

export function DeskShell({ signs, onSignOut, onSwitch, children }: {
  /// Whether this teammate signs money moves with a wallet on this desk.
  signs: boolean;
  onSignOut: () => void;
  onSwitch: (network: AdminDeskNetwork) => void;
  children: ReactNode;
}) {
  const { me, network } = useDesk();
  const counts = useDeskHome().home?.counts ?? {};
  const pathname = usePathname();
  const [search, setSearch] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [account, setAccount] = useState(false);
  const strip = STRIP[network];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div style={{ ...DESK_COLOURS, fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' } as CSSProperties} className="flex min-h-screen bg-[var(--d-bg)] text-[var(--d-text)]">
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 border-r border-[var(--d-line)] bg-[var(--d-side)] lg:block">
        <DeskSidebar pathname={pathname} counts={counts} onSwitch={onSwitch} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute inset-y-0 left-0 w-[264px] border-r border-[var(--d-line)] bg-[var(--d-side)]" onClick={(e) => e.stopPropagation()}>
            <DeskSidebar pathname={pathname} counts={counts} onSwitch={onSwitch} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="px-4 py-1.5 text-center text-[12px] font-medium lg:px-6" style={{ background: strip.bg, color: strip.fg }}>{strip.line}</p>

        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--d-line)] bg-[var(--d-bg)] px-4 lg:px-6">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open the menu" className="grid size-9 place-items-center rounded-md text-[var(--d-text-2)] hover:bg-[var(--d-hover)] lg:hidden">
            <Menu aria-hidden="true" strokeWidth={1.5} className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setSearch(true)}
            className="flex h-[33px] w-full max-w-[420px] items-center gap-2 rounded-md border border-[var(--d-line)] bg-[var(--d-surface)] pl-2.5 pr-2 text-left text-[13px] text-[var(--d-text-3)] transition hover:border-[var(--d-line-2)]"
          >
            <Search aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
            <span className="flex-1 truncate">Go to a page</span>
            <kbd className="hidden rounded border border-[var(--d-line)] px-1.5 text-[11px] font-medium sm:inline">⌘K</kbd>
          </button>
          <div className="flex-1" />
          {signs && <div className="hidden md:block"><AdminWalletControl /></div>}
          <span
            className="hidden items-center gap-1.5 rounded-full border py-1 pl-2 pr-2.5 text-[12px] font-medium sm:inline-flex"
            style={{ borderColor: network === 'mainnet' ? 'rgba(227,168,63,0.6)' : 'var(--d-line-2)' }}
          >
            <span className="size-[7px] rounded-full" style={{ background: network === 'mainnet' ? '#E3A83F' : 'var(--d-blue)' }} />
            {network === 'mainnet' ? 'Mainnet' : 'Testnet'}
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setAccount((v) => !v)}
              aria-expanded={account}
              aria-label="Your account"
              className="grid size-7 place-items-center rounded-full bg-[#2A3340] text-[11px] font-semibold text-[var(--d-text)]"
            >
              {initials(me.name)}
            </button>
            {account && (
              <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-1.5 shadow-lg">
                <p className="px-2 pt-1 text-[13px] font-medium">{me.name ?? 'Teammate'}</p>
                <p className="px-2 pb-1.5 text-[12px] text-[var(--d-text-3)]">{me.owner ? 'Owner' : me.email ?? 'Teammate'}</p>
                <button
                  type="button"
                  onClick={() => { setAccount(false); onSignOut(); }}
                  className="w-full rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-[var(--d-text)] hover:bg-[var(--d-hover)]"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {signs && <div className="border-b border-[var(--d-line)] px-4 py-3 md:hidden"><AdminWalletControl /></div>}
        <main className="w-full flex-1 px-4 py-5 lg:px-8">{children}</main>
      </div>

      <CommandMenu open={search} onClose={() => setSearch(false)} />
      {drawer && <button type="button" aria-label="Close the menu" onClick={() => setDrawer(false)} className="fixed right-3 top-3 z-50 grid size-9 place-items-center rounded-md bg-[var(--d-surface)] lg:hidden"><X aria-hidden="true" className="size-4" /></button>}
    </div>
  );
}
