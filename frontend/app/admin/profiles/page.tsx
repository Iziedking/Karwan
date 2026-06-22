'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type AdminProfileRow } from '@/core/api';
import { CopyId } from '@/shared/components/CopyId';
import { useDialog } from '@/shared/components/Dialog';

/// Admin profiles monitor: every registered account as a searchable table.
/// Search by address, name, or email; jump to the public credit passport.

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const PAGE_SIZE = 50;

export default function AdminProfiles() {
  const [profiles, setProfiles] = useState<AdminProfileRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { confirm, prompt, notify } = useDialog();

  useEffect(() => {
    setPage(0);
  }, [q]);

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
    let credit: number | undefined;
    if (!p.researchActive) {
      const amt = await prompt({
        title: 'Grant research credit',
        message: 'How much research credit, in USDC?',
        defaultValue: '5',
      });
      if (amt === null) return;
      credit = Number(amt);
      if (!Number.isFinite(credit) || credit <= 0) {
        notify('Enter an amount', 'error');
        return;
      }
    }
    setBusy(p.address);
    try {
      if (p.researchActive) await api.adminSetResearch(p.address, false, 0);
      else await api.adminSetResearch(p.address, true, credit);
      await reload();
      notify(p.researchActive ? 'Research cleared' : 'Research granted');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function toggleBusiness(p: AdminProfileRow) {
    const verify = p.businessStatus !== 'verified';
    const ok = await confirm({
      title: verify ? 'Verify business' : 'Remove verification',
      message: verify
        ? 'Mark this account as a verified business?'
        : 'Remove verified-business status?',
      confirmLabel: verify ? 'Verify' : 'Remove',
      danger: !verify,
    });
    if (!ok) return;
    setBusy(p.address);
    try {
      await api.adminSetBusiness(p.address, verify ? 'verified' : 'rejected');
      await reload();
      notify(verify ? 'Marked verified' : 'Verification removed');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed', 'error');
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
        <table className="w-full min-w-[680px] text-[13px]">
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
            {paged.map((p) => (
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

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 mono text-[11px] uppercase tracking-[0.1em] text-white/45">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="hover:text-white disabled:opacity-30"
          >
            ← prev
          </button>
          <span>
            page {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="hover:text-white disabled:opacity-30"
          >
            next →
          </button>
        </div>
      )}
    </div>
  );
}
