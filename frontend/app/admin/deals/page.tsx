'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type AdminDealRow } from '@/core/api';
import { CopyId } from '@/shared/components/CopyId';
import { useDialog } from '@/shared/components/Dialog';

/// Admin deals monitor: every deal as a searchable table. Search by ID, buyer,
/// seller, or stage; open any deal in the full deal page. This is how an
/// operator finds a user's deal from the ID they pasted into live support.

const STAGE_TONE: Record<string, string> = {
  open: '#9a8e6a',
  accepted: '#3a6ea5',
  delivered: '#3a6ea5',
  settled: '#4f8a3f',
  disputed: '#b25425',
  cancelled: '#7a7466',
};

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const PAGE_SIZE = 50;

export default function AdminDeals() {
  const [deals, setDeals] = useState<AdminDealRow[] | null>(null);
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
      const d = await api.adminDeals();
      setDeals(d.deals);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function extend(jobId: string) {
    const days = await prompt({
      title: 'Extend deadline',
      message: 'Extend the delivery deadline by how many days?',
      defaultValue: '3',
    });
    if (days === null) return;
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) {
      notify('Enter a number of days', 'error');
      return;
    }
    setBusy(jobId);
    try {
      await api.adminExtendDeal(jobId, Math.round(n * 86400));
      await reload();
      notify('Deadline extended');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Extend failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function release(jobId: string) {
    const ok = await confirm({
      title: 'Force-release milestone',
      message: 'Release the next milestone on this deal? This moves real USDC.',
      confirmLabel: 'Release',
      danger: true,
    });
    if (!ok) return;
    setBusy(jobId);
    try {
      const r = await api.adminReleaseDeal(jobId);
      await reload();
      notify(r.settled ? 'Released and settled' : `Released milestone ${r.milestoneIndex}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Release failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  const filtered = useMemo(() => {
    if (!deals) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return deals;
    return deals.filter(
      (d) =>
        d.jobId.toLowerCase().includes(needle) ||
        d.buyer.toLowerCase().includes(needle) ||
        d.seller.toLowerCase().includes(needle) ||
        d.stage.includes(needle),
    );
  }, [deals, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h1 className="font-sans text-[26px] font-extrabold tracking-[-0.01em]">Deals</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ID, wallet, stage..."
          className="bg-[#161616] border border-white/15 rounded-lg px-3 py-2 text-[13px] text-white font-mono w-full sm:w-[320px] focus:border-white/40 outline-none"
        />
      </div>
      {err && <p className="mt-3 text-[13px] text-[#e0794f]">{err}</p>}
      <p className="mt-3 mono text-[10px] uppercase tracking-[0.14em] text-white/35">
        {deals ? `${filtered.length} / ${deals.length}` : 'loading...'}
      </p>

      <div className="mt-3 overflow-x-auto border border-white/10 rounded-xl">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr className="text-white/40 mono text-[10px] uppercase tracking-[0.12em] text-start">
              <th className="text-start font-normal px-3 py-2.5">Deal ID</th>
              <th className="text-start font-normal px-3 py-2.5">Amount</th>
              <th className="text-start font-normal px-3 py-2.5">Stage</th>
              <th className="text-start font-normal px-3 py-2.5">Buyer</th>
              <th className="text-start font-normal px-3 py-2.5">Seller</th>
              <th className="text-end font-normal px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((d) => (
              <tr key={d.jobId} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                <td className="px-3 py-2.5">
                  <CopyId value={d.jobId} label={short(d.jobId)} className="text-[12px] text-white/70" />
                </td>
                <td className="px-3 py-2.5 tabular-nums">{d.amountUsdc} USDC</td>
                <td className="px-3 py-2.5">
                  <span
                    className="mono text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
                    style={{ color: STAGE_TONE[d.stage] ?? '#aaa', background: `${STAGE_TONE[d.stage] ?? '#aaa'}1f` }}
                  >
                    {d.stage}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <CopyId value={d.buyer} label={short(d.buyer)} className="text-[12px] text-white/55" />
                </td>
                <td className="px-3 py-2.5">
                  <CopyId value={d.seller} label={short(d.seller)} className="text-[12px] text-white/55" />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2 flex-wrap mono text-[10px] uppercase tracking-[0.1em]">
                    <Link
                      href={`/deals/${d.jobId}`}
                      className="text-white/55 hover:text-white underline underline-offset-2"
                    >
                      open ↗
                    </Link>
                    <button
                      type="button"
                      onClick={() => extend(d.jobId)}
                      disabled={busy === d.jobId}
                      className="text-white/55 hover:text-white disabled:opacity-40"
                    >
                      extend
                    </button>
                    {d.stage !== 'settled' && d.stage !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => release(d.jobId)}
                        disabled={busy === d.jobId}
                        className="text-[#c98a5e] hover:text-[#e0794f] disabled:opacity-40"
                      >
                        release
                      </button>
                    )}
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
