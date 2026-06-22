'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type AdminProfileRow } from '@/core/api';
import { CopyId } from '@/shared/components/CopyId';

/// Admin profiles monitor: every registered account as a searchable table.
/// Search by address, name, or email; jump to the public credit passport.

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function AdminProfiles() {
  const [profiles, setProfiles] = useState<AdminProfileRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    try {
      const p = await api.adminProfiles();
      setProfiles(p.profiles);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function toggleResearch(p: AdminProfileRow) {
    setBusy(p.address);
    try {
      if (p.researchActive) {
        await api.adminSetResearch(p.address, false, 0);
      } else {
        const amt = window.prompt('Grant how much research credit (USDC)?', '5');
        const n = Number(amt);
        if (!Number.isFinite(n) || n <= 0) return;
        await api.adminSetResearch(p.address, true, n);
      }
      await reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  async function toggleBusiness(p: AdminProfileRow) {
    const verify = p.businessStatus !== 'verified';
    if (!window.confirm(verify ? 'Mark this account as a verified business?' : 'Remove verified-business status?')) return;
    setBusy(p.address);
    try {
      await api.adminSetBusiness(p.address, verify ? 'verified' : 'rejected');
      await reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  const filtered = useMemo(() => {
    if (!profiles) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return profiles;
    return profiles.filter(
      (p) =>
        p.address.toLowerCase().includes(needle) ||
        (p.displayName ?? '').toLowerCase().includes(needle) ||
        (p.email ?? '').toLowerCase().includes(needle),
    );
  }, [profiles, q]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h1 className="font-sans text-[26px] font-extrabold tracking-[-0.01em]">Profiles</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search address, name, email..."
          className="bg-[#161616] border border-white/15 rounded-lg px-3 py-2 text-[13px] text-white font-mono w-full sm:w-[320px] focus:border-white/40 outline-none"
        />
      </div>
      {err && <p className="mt-3 text-[13px] text-[#e0794f]">{err}</p>}
      <p className="mt-3 mono text-[10px] uppercase tracking-[0.14em] text-white/35">
        {profiles ? `${filtered.length} / ${profiles.length}` : 'loading...'}
      </p>

      <div className="mt-3 overflow-x-auto border border-white/10 rounded-xl">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-white/40 mono text-[10px] uppercase tracking-[0.12em]">
              <th className="text-start font-normal px-3 py-2.5">Account</th>
              <th className="text-start font-normal px-3 py-2.5">Type</th>
              <th className="text-start font-normal px-3 py-2.5">Email</th>
              <th className="text-start font-normal px-3 py-2.5">Business</th>
              <th className="text-start font-normal px-3 py-2.5">Research</th>
              <th className="text-end font-normal px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.address} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                <td className="px-3 py-2.5">
                  <div className="text-white/85">{p.displayName || '—'}</div>
                  <CopyId value={p.address} label={short(p.address)} className="text-[11px] text-white/45" />
                </td>
                <td className="px-3 py-2.5">
                  <span className="mono text-[10px] uppercase tracking-[0.1em] text-white/55">
                    {p.accountType}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {p.email ? (
                    <span className={p.emailVerified ? 'text-[#7fae6f]' : 'text-white/55'}>
                      {p.email}
                      {p.emailVerified ? ' ✓' : ''}
                    </span>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="mono text-[10px] uppercase tracking-[0.1em] text-white/55">
                    {p.businessStatus}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {p.researchActive ? (
                    <span className="mono text-[10px] uppercase tracking-[0.1em] text-[#7fae6f]">
                      on · ${p.researchCreditUsdc.toFixed(2)}
                    </span>
                  ) : (
                    <span className="mono text-[10px] uppercase tracking-[0.1em] text-white/30">off</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2 flex-wrap mono text-[10px] uppercase tracking-[0.1em]">
                    <Link
                      href={`/credit-passport/${p.address}`}
                      className="text-white/55 hover:text-white underline underline-offset-2"
                    >
                      passport ↗
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleResearch(p)}
                      disabled={busy === p.address}
                      className="text-white/55 hover:text-white disabled:opacity-40"
                    >
                      {p.researchActive ? 'clear research' : 'grant research'}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleBusiness(p)}
                      disabled={busy === p.address}
                      className="text-white/55 hover:text-white disabled:opacity-40"
                    >
                      {p.businessStatus === 'verified' ? 'unverify' : 'verify biz'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
