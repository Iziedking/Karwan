'use client';
import { useState } from 'react';
import { api, type AdminEventEntry } from '@/core/api';
import { CopyId } from '@/shared/components/CopyId';

/// Admin event log: paste a deal ID to trace a whole auction (every bid, score,
/// skip, counter, match), or a wallet to trace one agent across deals. Durable,
/// so a problem like "agent never bid" is visible long after it happened.

function short(s: string): string {
  if (!s.startsWith('0x')) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

// Colour the type by category so problems pop.
function tone(type: string): string {
  if (type.includes('error') || type.includes('insufficient') || type.includes('disputed')) return '#e0794f';
  if (type.includes('skipped')) return '#c9a24b';
  if (type.startsWith('bid.scored')) return '#3a6ea5';
  if (type.startsWith('bid.') || type.includes('matched') || type.includes('settled') || type.includes('accepted')) return '#5aa56a';
  if (type.includes('counter') || type.includes('negotiation')) return '#9a8ec0';
  return '#8a8a8a';
}

const FIELDS = ['agent', 'kind', 'rail', 'amountUsd', 'demand', 'budgetUsdc', 'fairPriceUsdc', 'overPct', 'marketFairPriceUsdc', 'proceedPriceUsdc', 'limitUsdc', 'gapUsdc', 'seller', 'buyer', 'price', 'priceUsdc', 'agreedPriceUsdc', 'score', 'topicalMatch', 'tier', 'pattern', 'reason', 'message', 'detail', 'scope'];

const PAGE_SIZE = 50;

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(11, 19);
  } catch {
    return String(ts);
  }
}

export default function AdminEvents() {
  const [q, setQ] = useState('');
  const [events, setEvents] = useState<AdminEventEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [integrity, setIntegrity] = useState<Awaited<
    ReturnType<typeof api.adminWalletIntegrity>
  > | null>(null);
  const [intBusy, setIntBusy] = useState(false);

  async function checkIntegrity() {
    setIntBusy(true);
    try {
      setIntegrity(await api.adminWalletIntegrity());
    } catch {
      setIntegrity(null);
    } finally {
      setIntBusy(false);
    }
  }

  async function run(term: string) {
    const v = term.trim();
    if (!v) return;
    setBusy(true);
    setErr(null);
    try {
      // 0x + 64 hex = job id; 0x + 40 hex = wallet; otherwise treat as a type.
      const params =
        /^0x[0-9a-fA-F]{64}$/.test(v)
          ? { jobId: v }
          : /^0x[0-9a-fA-F]{40}$/.test(v)
            ? { address: v }
            : { type: v };
      const r = await api.adminEvents({ ...params, limit: 300 });
      setEvents(r.events);
      setPage(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Query failed');
    } finally {
      setBusy(false);
    }
  }

  function trace(addr: string) {
    setQ(addr);
    void run(addr);
  }

  const pageCount = events ? Math.max(1, Math.ceil(events.length / PAGE_SIZE)) : 1;
  const pageItems = events ? events.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) : [];

  return (
    <div>
      <h1 className="font-sans text-[26px] font-extrabold tracking-[-0.01em]">Events</h1>
      <p className="mt-1 text-[13px] text-white/45">
        Paste a deal ID to trace an auction, or a wallet to trace one agent across deals.
      </p>

      <div className="mt-4 border border-white/10 rounded-lg p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-white/45">
            wallet integrity — finds agent addresses claimed by more than one user
          </span>
          <button
            type="button"
            onClick={() => void checkIntegrity()}
            disabled={intBusy}
            className="mono text-[10px] uppercase tracking-[0.1em] font-bold px-3 py-1.5 rounded border border-white/20 hover:border-white/50 disabled:opacity-50"
          >
            {intBusy ? 'checking…' : 'check'}
          </button>
        </div>
        {integrity && (
          <div className="mt-3 text-[12px]">
            <p className="mono text-[10px] uppercase tracking-[0.12em] text-white/40">
              {integrity.total} records · {integrity.sharedAddresses.length} shared ·{' '}
              {integrity.emptyBuyer.length + integrity.emptySeller.length} blank
            </p>
            {integrity.sharedAddresses.length === 0 ? (
              <p className="mt-2 text-[#5aa56a]">Clean — no agent address is shared across users.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {integrity.sharedAddresses.map((s) => (
                  <li key={s.address} className="font-mono text-[11px] text-[#e0794f]">
                    <span className="text-white/80">{s.address}</span>{' '}
                    <span className="text-white/40">({s.role})</span> →{' '}
                    {s.users.map((u) => short(u)).join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="0x deal id, 0x wallet, or an event type (e.g. agent.skipped)"
          className="flex-1 bg-[#161616] border border-white/15 rounded-lg px-3 py-2 text-[13px] text-white font-mono focus:border-white/40 outline-none"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="mono text-[11px] uppercase tracking-[0.1em] font-bold px-4 py-2 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-50"
        >
          {busy ? '…' : 'Trace'}
        </button>
      </form>

      {err && <p className="mt-3 text-[13px] text-[#e0794f]">{err}</p>}
      {events && (
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            {events.length} events{pageCount > 1 ? ` · page ${page + 1}/${pageCount}` : ''}
          </p>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="mono text-[10px] uppercase tracking-[0.1em] px-2.5 py-1 rounded border border-white/15 disabled:opacity-30 hover:border-white/40"
              >
                prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="mono text-[10px] uppercase tracking-[0.1em] px-2.5 py-1 rounded border border-white/15 disabled:opacity-30 hover:border-white/40"
              >
                next
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {pageItems.map((e, i) => {
          const p = e.data.payload ?? {};
          const seller = typeof p.seller === 'string' ? p.seller : '';
          return (
            <div
              key={i}
              className="border border-white/10 rounded-lg px-3 py-2 flex items-start gap-3 flex-wrap"
            >
              <span className="mono text-[9px] text-white/30 tabular-nums shrink-0 w-[60px]">
                {fmtTime(e.ts)}
              </span>
              <span
                className="mono text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0"
                style={{ color: tone(e.type), background: `${tone(e.type)}1f` }}
              >
                {e.type}
              </span>
              <div className="flex-1 min-w-[200px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/70">
                {seller && (
                  <button
                    type="button"
                    onClick={() => trace(seller)}
                    title="Trace this agent"
                    className="mono text-[11px] text-[#7fae9f] hover:text-white underline underline-offset-2"
                  >
                    {short(seller)}
                  </button>
                )}
                {FIELDS.filter((f) => f !== 'seller' && p[f] !== undefined && p[f] !== null).map((f) => (
                  <span key={f} className="mono text-[11px]">
                    <span className="text-white/35">{f}=</span>
                    {String(p[f]).slice(0, 80)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {events && events.length === 0 && (
          <p className="text-[13px] text-white/35 py-6 text-center">
            No events. If you traced a wallet and expected a bid, the agent never put one on chain
            for this deal.
          </p>
        )}
      </div>
    </div>
  );
}
