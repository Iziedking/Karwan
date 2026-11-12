'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminDeskAction } from '@/core/api';

/// Every change made from the desk, and every refusal, newest first (view 64).
/// Rows are only ever added; nothing here edits or removes one.

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const VIA: Record<AdminDeskAction['via'], string> = { session: 'Desk', key: 'Key', 'shared-token': 'Shared token', 'sign-in': 'Sign-in' };

export default function AdminLogPage() {
  const [rows, setRows] = useState<AdminDeskAction[]>([]);
  const [more, setMore] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback((before?: number) => {
    api
      .adminDeskActions(before)
      .then((r) => {
        setRows((cur) => (before ? [...cur, ...r.actions] : r.actions));
        setMore(r.actions.length === 50);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load the log'));
  }, []);
  useEffect(() => load(), [load]);

  return (
    <div>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/40">Change log</p>
      <h1 className="mt-2 font-sans text-[24px] font-extrabold">Every change from the desk</h1>
      {err && <p role="alert" className="mt-4 rounded-lg border border-[#e0794f]/30 bg-[#e0794f]/10 px-3 py-2 text-[12px] text-[#e0794f]">{err}</p>}
      <ul className="mt-6 divide-y divide-white/8 border-y border-white/8">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="grid w-full min-h-12 gap-1 py-3 text-left sm:grid-cols-[150px_1fr_160px_90px] sm:items-center sm:gap-3">
              <span className="text-[12px] tabular-nums text-white/45">{when(r.at)}</span>
              <span className="min-w-0 truncate font-mono text-[12px] text-white/80">{r.method} {r.path}</span>
              <span className="truncate text-[12px] text-white/60">{r.memberEmail ?? VIA[r.via]}</span>
              <span className={`text-[12px] font-semibold ${r.outcome === 'done' ? 'text-[#AFC95B]' : r.outcome === 'failed' ? 'text-[#efaa8d]' : 'text-white/50'}`}>
                {r.outcome === 'done' ? 'Done' : r.outcome === 'failed' ? 'Failed' : 'Refused'}
              </span>
            </button>
            {open === r.id && (
              <div className="grid gap-3 pb-4 sm:grid-cols-2">
                <pre className="overflow-x-auto rounded-lg bg-[#0e0e0e] p-3 text-[11px] text-white/70">{JSON.stringify({ via: VIA[r.via], status: r.status, request: r.request }, null, 2)}</pre>
                <pre className="overflow-x-auto rounded-lg bg-[#0e0e0e] p-3 text-[11px] text-white/70">{JSON.stringify(r.result, null, 2)}</pre>
              </div>
            )}
          </li>
        ))}
      </ul>
      {more && rows.length > 0 && (
        <button type="button" onClick={() => load(rows[rows.length - 1]!.at)} className="mt-4 min-h-11 rounded-lg border border-white/15 px-4 text-[12px]">
          Older
        </button>
      )}
    </div>
  );
}
