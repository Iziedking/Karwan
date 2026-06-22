'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api, setAdminToken, ApiError } from '@/core/api';

/// Admin chrome. Gates every /admin/* route behind the operator token, held
/// IN MEMORY ONLY (see api.ts setAdminToken) — it survives navigation between
/// admin pages but is gone on a hard refresh or new tab, so nothing persists
/// for an attacker to lift. One unlock covers the whole section; the existing
/// treasury/usyc/feedback pages inherit the same in-memory token.

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/deals', label: 'Deals' },
  { href: '/admin/profiles', label: 'Profiles' },
  { href: '/admin/support', label: 'Support' },
  { href: '/admin/treasury', label: 'Treasury' },
  { href: '/admin/usyc', label: 'USYC' },
  { href: '/admin/feedback', label: 'Feedback' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [token, setToken] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    const t = token.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    setAdminToken(t);
    try {
      // Cheap authenticated call validates the token before unlocking.
      await api.adminProfiles();
      setUnlocked(true);
    } catch (e) {
      setAdminToken(null);
      setErr(e instanceof ApiError ? e.message : 'Invalid token');
    } finally {
      setBusy(false);
    }
  }

  function lock() {
    setAdminToken(null);
    setUnlocked(false);
    setToken('');
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e] px-4">
        <form
          onSubmit={unlock}
          className="w-full max-w-[400px] bg-[#161616] border border-white/10 rounded-2xl p-7"
        >
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/40">[:ADMIN:]</p>
          <h1 className="mt-2 font-sans text-[22px] font-extrabold text-white">Operator access</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/45">
            Enter the admin token. It is held in memory only and cleared on
            refresh, so nothing is stored on this device.
          </p>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Admin token"
            autoComplete="off"
            className="mt-5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] text-white font-mono focus:border-white/40 outline-none"
          />
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="mt-4 w-full mono text-[11px] uppercase tracking-[0.12em] font-bold px-4 py-3 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-50 transition"
          >
            {busy ? 'Verifying...' : 'Unlock'}
          </button>
          {err && <p className="mt-3 text-[12px] text-[#e0794f]">{err}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      <header className="sticky top-0 z-10 bg-[#0e0e0e]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 flex items-center justify-between gap-4 h-14">
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`shrink-0 mono text-[11px] uppercase tracking-[0.1em] px-3 py-1.5 rounded-md transition ${
                    active ? 'bg-white text-[#0e0e0e] font-bold' : 'text-white/55 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={lock}
            className="shrink-0 mono text-[10px] uppercase tracking-[0.12em] text-white/40 hover:text-white transition"
          >
            Lock
          </button>
        </div>
      </header>
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
