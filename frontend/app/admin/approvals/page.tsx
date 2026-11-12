'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminMoneyRequest } from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';

/// Money and chain moves waiting for a second member (view 64). The member who
/// asked cannot approve their own; the target is read again before it runs.

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const STATUS: Record<AdminMoneyRequest['status'], string> = {
  pending: 'Waiting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  refused: 'Refused, the target changed',
  cancelled: 'Withdrawn',
  expired: 'Expired',
};

export default function AdminApprovalsPage() {
  const { confirm, notify } = useDialog();
  const [requests, setRequests] = useState<AdminMoneyRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminMoneyRequests()
      .then((r) => {
        setRequests(r.requests);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load approvals'));
  }, []);
  useEffect(load, [load]);

  async function approve(r: AdminMoneyRequest) {
    const ok = await confirm({
      title: r.label,
      message: `${r.requestedBy.name ?? r.requestedBy.email} asked: ${r.reason}. It runs now as you, once, if the target has not changed since.`,
      confirmLabel: 'Approve and run',
      danger: true,
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      const out = await api.adminApproveRequest(r.id);
      notify(out.request.status === 'done' ? 'Approved and done' : `Ran, answer ${out.request.result?.status ?? ''}`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not approve', 'error');
    } finally {
      setBusy(null);
      load();
    }
  }

  async function withdraw(r: AdminMoneyRequest) {
    setBusy(r.id);
    try {
      await api.adminWithdrawRequest(r.id);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not withdraw', 'error');
    } finally {
      setBusy(null);
      load();
    }
  }

  const waiting = requests?.filter((r) => r.status === 'pending') ?? [];
  const decided = requests?.filter((r) => r.status !== 'pending') ?? [];

  return (
    <div>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/40">Approvals</p>
      <h1 className="mt-2 font-sans text-[24px] font-extrabold">Money moves waiting for a second member</h1>
      <p className="mt-2 max-w-[68ch] text-[13px] text-white/55">
        Each one was asked for by a member and moves nothing until a different member with the same page approves it, within 24 hours.
      </p>
      {err && <p role="alert" className="mt-4 rounded-lg border border-[#e0794f]/30 bg-[#e0794f]/10 px-3 py-2 text-[12px] text-[#e0794f]">{err}</p>}

      <section className="mt-6">
        <h2 className="text-[15px] font-bold">Waiting</h2>
        {requests && waiting.length === 0 && <p className="mt-2 text-[13px] text-white/45">Nothing is waiting.</p>}
        <ul className="mt-3 space-y-3">
          {waiting.map((r) => (
            <li key={r.id} className="rounded-xl border border-white/10 bg-[#161616] p-4">
              <p className="text-[14px] font-bold">{r.label}</p>
              <p className="mt-1 font-mono text-[12px] text-white/55">{r.method} {r.path}{r.query}</p>
              <p className="mt-2 text-[13px] text-white/75">{r.reason}</p>
              {/^K[ST]-\d{4,}:/.test(r.reason) && (
                <Link href={`/admin/support?case=${r.reason.split(':')[0]}`} className="mt-1 inline-flex min-h-9 items-center text-[12px] text-white/70 underline underline-offset-4">
                  Open case {r.reason.split(':')[0]}
                </Link>
              )}
              <p className="mt-1 text-[12px] text-white/45">Asked by {r.requestedBy.name ?? r.requestedBy.email}, {when(r.requestedAt)}. Expires {when(r.expiresAt)}.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy === r.id} onClick={() => approve(r)} className="min-h-11 rounded-lg bg-[#AFC95B] px-4 text-[12px] font-bold text-[#0A0A0B] disabled:opacity-40">
                  Approve
                </button>
                <button type="button" disabled={busy === r.id} onClick={() => withdraw(r)} className="min-h-11 rounded-lg border border-white/15 px-4 text-[12px] disabled:opacity-40">
                  Withdraw
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-bold">Decided</h2>
        <ul className="mt-3 divide-y divide-white/8 border-y border-white/8">
          {decided.map((r) => (
            <li key={r.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_200px_160px] sm:items-center">
              <span className="text-[13px]">{r.label}</span>
              <span className="text-[12px] text-white/50">{r.requestedBy.name ?? r.requestedBy.email}{r.approvedBy ? `, approved by ${r.approvedBy.name ?? r.approvedBy.email}` : ''}</span>
              <span className="text-[12px] text-white/60">{STATUS[r.status]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
