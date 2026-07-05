'use client';
import { useEffect, useState } from 'react';
import { api, type AdminEventEntry } from '@/core/api';

/// Admin payments log: every agent-to-agent x402 payment on Karwan. These are
/// the `agent.paid` events the agents emit when they pay for data mid-deal — the
/// internal Arc credit-passport pulls (rail=arc) and the off-platform market
/// research on Base (rail=base). Each links to the block explorer where an
/// on-chain artifact exists; Arc nanopayments settle in Gateway batches so a
/// single read often has no per-call hash (shown as "batched").

const ARC_SCAN = 'https://testnet.arcscan.app';
const BASE_SCAN = 'https://sepolia.basescan.org';

function isHash(v: unknown): v is string {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
}
function isAddr(v: unknown): v is string {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
}
function short(s: string): string {
  return s.startsWith('0x') ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}
function fmtTime(ts: number): string {
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
  } catch {
    return String(ts);
  }
}
function fmtUsd(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

/// The best on-chain link for a payment: the settlement tx when it exists, else
/// the paying wallet's explorer page. Null when neither is present (a batched
/// Arc read with no captured payer).
function scanLink(
  rail: string,
  txHash: unknown,
  payer: unknown,
): { href: string; label: string } | null {
  const base = rail === 'base' ? BASE_SCAN : ARC_SCAN;
  if (isHash(txHash)) return { href: `${base}/tx/${txHash}`, label: 'tx ↗' };
  if (isAddr(payer)) return { href: `${base}/address/${payer}`, label: 'payer ↗' };
  return null;
}

export default function AdminPayments() {
  const [events, setEvents] = useState<AdminEventEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.adminEvents({ type: 'agent.paid', limit: 500 });
      setEvents(r.events);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Query failed');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totalUsd = (events ?? []).reduce((sum, e) => {
    const n = Number(e.data.payload?.amountUsd);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const arcCount = (events ?? []).filter((e) => e.data.payload?.rail === 'arc').length;
  const baseCount = (events ?? []).filter((e) => e.data.payload?.rail === 'base').length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-sans text-[26px] font-extrabold tracking-[-0.01em]">Payments</h1>
          <p className="mt-1 text-[13px] text-white/45">
            Every agent-to-agent x402 payment: internal Arc credit-passport pulls and off-platform
            market research on Base.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="shrink-0 mono text-[10px] uppercase tracking-[0.1em] font-bold px-3 py-1.5 rounded border border-white/20 hover:border-white/50 disabled:opacity-50"
        >
          {busy ? 'loading…' : 'refresh'}
        </button>
      </div>

      {events && (
        <div className="mt-4 flex items-center gap-x-5 gap-y-1 flex-wrap mono text-[10px] uppercase tracking-[0.12em] text-white/40">
          <span>{events.length} payments</span>
          <span>
            <span className="text-white/70">{fmtUsd(totalUsd)}</span> total
          </span>
          <span>{arcCount} on arc</span>
          <span>{baseCount} on base</span>
        </div>
      )}

      {err && <p className="mt-3 text-[13px] text-[#e0794f]">{err}</p>}

      <div className="mt-3 space-y-1.5">
        {(events ?? []).map((e, i) => {
          const p = e.data.payload ?? {};
          const rail = typeof p.rail === 'string' ? p.rail : 'arc';
          const kind = typeof p.kind === 'string' ? p.kind : '';
          const agent = typeof p.agent === 'string' ? p.agent : '';
          const counterparty =
            (typeof p.subject === 'string' && p.subject) ||
            (typeof p.seller === 'string' && p.seller) ||
            (typeof p.user === 'string' && p.user) ||
            '';
          const link = scanLink(rail, p.txHash, p.payer);
          const railColor = rail === 'base' ? '#3a6ea5' : '#8bbf4d';
          return (
            <div
              key={i}
              className="border border-white/10 rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap"
            >
              <span className="mono text-[9px] text-white/30 tabular-nums shrink-0 w-[132px]">
                {fmtTime(e.ts)}
              </span>
              <span
                className="mono text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded shrink-0"
                style={{ color: railColor, background: `${railColor}1f` }}
              >
                {rail}
              </span>
              {kind && (
                <span className="mono text-[10px] uppercase tracking-[0.1em] text-white/45 shrink-0">
                  {kind}
                </span>
              )}
              <span className="font-sans text-[13px] font-extrabold tabular-nums shrink-0 w-[80px]">
                {fmtUsd(p.amountUsd)}
              </span>
              <div className="flex-1 min-w-[160px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/60">
                {agent && (
                  <span className="mono text-[11px]">
                    <span className="text-white/35">by </span>
                    {agent}
                  </span>
                )}
                {counterparty && (
                  <span className="mono text-[11px] tabular-nums">
                    <span className="text-white/35">on </span>
                    {short(counterparty)}
                  </span>
                )}
              </div>
              {link ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 mono text-[10px] uppercase tracking-[0.12em] text-[#7fae9f] hover:text-white underline underline-offset-2"
                >
                  {link.label}
                </a>
              ) : (
                <span className="shrink-0 mono text-[10px] uppercase tracking-[0.12em] text-white/25">
                  batched
                </span>
              )}
            </div>
          );
        })}
        {events && events.length === 0 && (
          <p className="text-[13px] text-white/35 py-6 text-center">
            No agent payments recorded yet. They appear here once agents pay for data during a deal.
          </p>
        )}
      </div>
    </div>
  );
}
