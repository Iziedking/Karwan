'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, type ChainEvent } from '@/core/api';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';

/// Live, interactive x402 panel: each nanopayment an agent makes for this deal
/// streams in as it happens — internal reputation pulls on Arc, off-platform
/// market research on Base — with the amount and on-chain proof. UI copy frames
/// it as "agents paying for data"; the x402 term stays in docs.

const ARC_EXPLORER = 'https://testnet.arcscan.app';

interface Payment {
  id: string;
  kind: 'reputation' | 'research';
  rail: 'arc' | 'base';
  agent: 'buyer' | 'seller';
  amountUsd: number;
  txHash?: string;
  payer?: string;
  ts: number;
  tier?: string;
  score?: number;
  demand?: string;
}

function fromEvent(e: ChainEvent): Payment | null {
  if (e.type !== 'agent.paid') return null;
  const p = e.payload;
  return {
    id: `${e.ts}-${String(p.txHash ?? p.kind)}`,
    kind: p.kind === 'reputation' ? 'reputation' : 'research',
    rail: p.rail === 'arc' ? 'arc' : 'base',
    agent: p.agent === 'seller' ? 'seller' : 'buyer',
    amountUsd: Number(p.amountUsd ?? 0),
    txHash: typeof p.txHash === 'string' ? p.txHash : undefined,
    payer: typeof p.payer === 'string' ? p.payer : undefined,
    ts: e.ts,
    tier: typeof p.tier === 'string' ? p.tier : undefined,
    score: typeof p.score === 'number' ? p.score : undefined,
    demand: typeof p.demand === 'string' ? p.demand : undefined,
  };
}

function explorerUrl(p: Payment): string | null {
  if (p.txHash) {
    return p.rail === 'arc'
      ? `${ARC_EXPLORER}/tx/${p.txHash}`
      : `https://basescan.org/tx/${p.txHash}`;
  }
  if (p.rail === 'base' && p.payer) return `https://basescan.org/tokentxns?a=${p.payer}`;
  return null;
}

function dedupeSort(list: Payment[]): Payment[] {
  const seen = new Set<string>();
  const out: Payment[] = [];
  for (const p of list) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out.sort((a, b) => b.ts - a.ts);
}

export function AgentX402Panel({ jobId }: { jobId: string }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .recentEvents(jobId, 'agent.paid', 50)
      .then((r) => {
        if (cancelled) return;
        // Only show entries where USDC actually moved. A free read (paidUsd 0,
        // no txHash) is not a payment and would render as a "$0.000" row with no
        // receipt; drop it so the card only ever shows real, provable spend.
        setPayments(
          dedupeSort(
            r.events
              .map(fromEvent)
              .filter((p): p is Payment => p !== null && p.amountUsd > 0),
          ),
        );
      })
      .catch(() => {
        /* seed is best-effort; live stream still fills in */
      });
    const unsub = subscribeLiveEvents((e) => {
      if (e.type !== 'agent.paid' || e.jobId !== jobId) return;
      const p = fromEvent(e);
      if (p && p.amountUsd > 0) setPayments((prev) => dedupeSort([p, ...prev]));
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [jobId]);

  const total = useMemo(() => payments.reduce((s, p) => s + p.amountUsd, 0), [payments]);

  if (payments.length === 0) return null;

  return (
    <div
      className="bg-[var(--lp-card)] border border-[var(--lp-border-light)] p-5"
      style={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 4,
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
          [:AGENT PAYMENTS:]
        </span>
        <span className="inline-flex items-center gap-2 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
          <span aria-hidden className="inline-block size-1.5 rounded-full bg-[var(--lp-accent)] animate-pulse" />
          agents paid ${total.toFixed(3)} · {payments.length} call{payments.length === 1 ? '' : 's'}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-[var(--lp-text-sub)] max-w-[60ch]">
        Your agents pay per call for the data they negotiate with. Reputation checks
        run on our own x402 on Arc; market research on an external x402 on Base.
      </p>

      <ul className="mt-4 space-y-2">
        {payments.map((p) => {
          const isOpen = openId === p.id;
          const railTone = p.rail === 'arc' ? '#4f8a3f' : '#3a6ea5';
          // Make the bilateral direction explicit: on a reputation pull the buyer
          // agent verifies the seller and the seller agent verifies the buyer, so
          // a judge sees both sides paying to vet each other on our own x402.
          const label =
            p.kind === 'reputation'
              ? p.agent === 'seller'
                ? 'verified the buyer'
                : 'verified the seller'
              : 'researched the market';
          const href = explorerUrl(p);
          return (
            <li
              key={p.id}
              className="border border-[var(--lp-border-light)] rounded-xl overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : p.id)}
                className="w-full text-start px-3.5 py-2.5 flex items-center gap-3 hover:bg-black/[0.02] transition"
              >
                <span
                  className="mono text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded shrink-0"
                  style={{ color: railTone, background: `${railTone}1f` }}
                >
                  {p.rail === 'arc' ? 'Arc' : 'Base'}
                </span>
                <span className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] shrink-0">
                  {p.agent} agent
                </span>
                <span className="flex-1 text-[13px] text-[var(--lp-dark)] truncate">{label}</span>
                <span className="mono text-[13px] font-bold tabular-nums text-[var(--lp-dark)] shrink-0">
                  ${p.amountUsd.toFixed(3)}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                  className={`shrink-0 text-[var(--lp-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-3.5 pb-3 pt-1 text-[12px] text-[var(--lp-text-sub)] border-t border-[var(--lp-border-light)]">
                  {p.kind === 'reputation' && (p.tier || p.score != null) && (
                    <p className="mt-2">
                      Returned: tier <strong className="text-[var(--lp-dark)]">{p.tier ?? '—'}</strong>
                      {p.score != null && (
                        <>
                          {' '}· score <strong className="text-[var(--lp-dark)]">{p.score}</strong>
                        </>
                      )}
                    </p>
                  )}
                  {p.kind === 'research' && p.demand && (
                    <p className="mt-2">
                      Found: demand <strong className="text-[var(--lp-dark)]">{p.demand}</strong>. The
                      agent used this read to price the deal.
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                    <span>${p.amountUsd.toFixed(3)} on {p.rail === 'arc' ? 'Arc' : 'Base'}</span>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:opacity-80"
                        style={{ color: railTone }}
                      >
                        {p.txHash ? 'view payment ↗' : 'view payer ↗'}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
