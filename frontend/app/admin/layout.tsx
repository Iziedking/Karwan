'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { WagmiProvider } from 'wagmi';
import { api, setAdminToken } from '@/core/api';
import { adminWagmiConfig } from '@/core/adminWagmi';
import { DialogProvider } from '@/shared/components/Dialog';
import { AdminWalletControl } from '@/features/admin/AdminWalletControl';
import {
  adminNavigationForRole,
  adminNavigationItem,
  type AdminNavigationGroup,
} from '@/features/admin/adminNavigation';

function Navigation({ groups, pathname, compact = false }: {
  groups: AdminNavigationGroup[];
  pathname: string;
  compact?: boolean;
}) {
  return (
    <nav aria-label="Admin workspaces" className={compact ? 'grid gap-4' : 'space-y-6'}>
      {groups.map((group) => (
        <section key={group.label}>
          <p className="px-3 mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">{group.label}</p>
          <div className={compact ? 'mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2' : 'mt-2 space-y-1'}>
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`group block min-h-11 border-l-2 px-3 py-2.5 transition ${active ? 'border-[#AFC95B] bg-white/[0.045] text-white' : 'border-transparent text-white/58 hover:border-white/20 hover:bg-white/[0.025] hover:text-white'}`}
                >
                  <span className="block text-[12px] font-semibold leading-tight">{item.label}</span>
                  <span className={`mt-1 block text-[10px] leading-tight ${active ? 'text-white/55' : 'text-white/30 group-hover:text-white/45'}`}>{item.description}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

function AccessGate({ onUnlock }: { onUnlock: (role: 'admin' | 'support') => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    const value = token.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(false);
    setAdminToken(value);
    try {
      const response = await api.adminWhoami();
      if (response.role !== 'admin' && response.role !== 'support') throw new Error('invalid role');
      onUnlock(response.role);
    } catch {
      setAdminToken(null);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0A0B] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-[1040px] items-center gap-10 lg:grid-cols-[1fr_420px]">
        <section className="max-w-[560px]">
          <div className="mb-5 flex items-center gap-3">
            <img src="/brand/karwan-mark-lime.svg" alt="Karwan" className="size-10 rounded-[10px]" />
            <p className="mono text-[10px] font-bold uppercase tracking-[0.19em] text-[#AFC95B]">[:KARWAN OPERATOR:]</p>
          </div>
          <h1 className="mt-4 max-w-[520px] font-sans text-[clamp(36px,6vw,68px)] font-black leading-[0.95] tracking-[-0.045em]">Run trade operations with clear authority.</h1>
          <p className="mt-6 max-w-[520px] text-[15px] leading-7 text-white/55">Review customer work, monitor agent execution, resolve exceptions, and control funds from one audited console.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ['01', 'Unlock', 'Verify your operator access key.'],
              ['02', 'Connect', 'Choose a separate signing wallet.'],
              ['03', 'Act', 'Use reviewed tools with visible consequences.'],
            ].map(([number, title, copy]) => (
              <div key={number} className="border-t border-white/12 pt-3">
                <p className="mono text-[9px] text-[#AFC95B]">{number}</p>
                <p className="mt-2 text-[12px] font-bold text-white/85">{title}</p>
                <p className="mt-1 text-[11px] leading-5 text-white/38">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <form onSubmit={unlock} className="rounded-2xl border border-white/12 bg-[#121315] p-5 shadow-2xl shadow-black/30 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mono text-[9px] uppercase tracking-[0.17em] text-white/35">Operator session</p>
              <p className="mt-2 text-[20px] font-extrabold">Unlock console</p>
            </div>
            <span className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-3 mono text-[9px] uppercase tracking-[0.12em] text-white/40">Session scoped</span>
          </div>
          <label htmlFor="operator-key" className="mt-7 block mono text-[10px] font-bold uppercase tracking-[0.13em] text-white/55">Operator access key</label>
          <input
            id="operator-key"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Enter access key"
            autoComplete="off"
            aria-invalid={error}
            aria-describedby="operator-key-help"
            className="mt-2 min-h-12 w-full rounded-lg border border-white/15 bg-[#0A0A0B] px-3 font-mono text-[14px] text-white outline-none transition placeholder:text-white/25 focus:border-[#AFC95B]/60"
          />
          <p id="operator-key-help" className="mt-2 text-[11px] leading-5 text-white/38">The key stays in this tab only and is cleared when you lock or refresh the console.</p>
          <button type="submit" disabled={busy || !token.trim()} className="mt-5 min-h-12 w-full rounded-lg bg-[#AFC95B] px-4 mono text-[11px] font-bold uppercase tracking-[0.13em] text-[#0A0A0B] transition hover:bg-[#AFC95B] disabled:cursor-not-allowed disabled:opacity-45">
            {busy ? 'Verifying access...' : 'Unlock operator console'}
          </button>
          {error && <p role="alert" className="mt-3 rounded-lg border border-[#e0794f]/25 bg-[#e0794f]/8 px-3 py-2.5 text-[12px] text-[#efaa8d]">Access could not be verified. Check the key and try again.</p>}
          <div className="mt-6 border-t border-white/8 pt-4">
            <p className="text-[11px] leading-5 text-white/38">Signing is separate. The console will never reuse the customer wallet connected elsewhere in Karwan.</p>
          </div>
        </form>
      </div>
    </main>
  );
}

function AdminConsole({ role, onLock, children }: {
  role: 'admin' | 'support';
  onLock: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navigation = adminNavigationForRole(role);
  const activeItem = adminNavigationItem(pathname);

  useEffect(() => {
    if (role === 'support' && pathname !== '/admin/support') router.replace('/admin/support');
  }, [role, pathname, router]);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white [&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0A0A0B]">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin" className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg pr-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#AFC95B]">
              <img src="/brand/karwan-mark-lime.svg" alt="Karwan" className="size-9 rounded-[9px]" />
              <span className="hidden sm:block">
                <span className="block text-[12px] font-extrabold tracking-[0.04em]">KARWAN<span className="text-[#AFC95B]">.</span></span>
                <span className="block mono text-[8px] uppercase tracking-[0.16em] text-white/35">Operator console</span>
              </span>
            </Link>
            <span className="hidden h-7 w-px bg-white/10 sm:block" />
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-white/75">{activeItem?.label ?? 'Operator workspace'}</p>
              <p className="hidden truncate text-[10px] text-white/35 sm:block">{activeItem?.description ?? 'Reviewed operational controls'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {role === 'admin' ? (
              <div className="hidden md:block"><AdminWalletControl /></div>
            ) : (
              <span className="hidden min-h-11 items-center rounded-lg border border-white/10 px-3 mono text-[9px] uppercase tracking-[0.11em] text-white/40 md:inline-flex">Support scope</span>
            )}
            <button type="button" onClick={onLock} className="min-h-11 rounded-lg border border-white/12 px-3 mono text-[10px] uppercase tracking-[0.12em] text-white/50 transition hover:border-white/25 hover:text-white">Lock</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] overflow-y-auto border-r border-white/8 px-3 py-6 lg:block">
          <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#AFC95B]" /><p className="mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#AFC95B]">{role} session</p></div>
            <p className="mt-2 text-[10px] leading-4 text-white/38">Authority is scoped by the access key. Wallet signing stays opt-in.</p>
          </div>
          <Navigation groups={navigation} pathname={pathname} />
        </aside>

        <div className="min-w-0">
          {role === 'admin' && <div className="border-b border-white/8 px-4 py-3 md:hidden"><AdminWalletControl /></div>}
          <details className="group border-b border-white/8 lg:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">Browse workspaces<span aria-hidden="true" className="text-[#AFC95B] transition group-open:rotate-45">+</span></summary>
            <div className="border-t border-white/8 px-4 py-5"><Navigation groups={navigation} pathname={pathname} compact /></div>
          </details>
          <main className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8"><DialogProvider>{children}</DialogProvider></main>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<'admin' | 'support' | null>(null);

  function lock() {
    setAdminToken(null);
    setRole(null);
  }

  if (!role) return <AccessGate onUnlock={setRole} />;
  return (
    <WagmiProvider config={adminWagmiConfig} reconnectOnMount={false}>
      <AdminConsole role={role} onLock={lock}>{children}</AdminConsole>
    </WagmiProvider>
  );
}
