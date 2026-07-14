'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type ApiMarketRead } from '@/core/api';
import { MarketReadCard, type MarketReadData } from '@/shared/components/MarketReadCard';

/// Market scout (audit/AGENTIC_WORKFLOW_REVIEW.md item 10). The user types a
/// topic, their prepaid research credit funds a fresh off-platform market read,
/// and the same MarketReadCard the agents produce renders here. A "start a
/// request" link carries the topic + fair price into the composer as a prefill.
/// Surfaced only when SCOUT_ENABLED (buyer side column); the backend route is
/// separately gated by SCOUT_ENABLED so both must be on.

const CARD_STYLE = {
  background: 'var(--lp-card)',
  color: 'var(--lp-dark)',
  border: '1px solid var(--lp-border-light)',
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  borderBottomLeftRadius: 22,
  borderBottomRightRadius: 5,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
} as const;

function toCardData(read: ApiMarketRead): MarketReadData {
  return {
    keywords: read.keywords,
    summary: read.summary,
    demand: read.demand,
    priceNote: read.priceNote,
    fairPriceUsdc: read.fairPriceUsdc,
    priceConfidence: read.priceConfidence,
    priceBandUsdc: read.priceBandUsdc,
    priceObservations: read.priceObservations,
    highlights: read.highlights,
    sources: read.sources,
    anglesRun: read.anglesRun,
    amountUsd: read.paidUsd,
    txHash: read.txHash,
    payer: read.payer,
    researchedAt: read.researchedAt,
  };
}

/// Carry the scouted topic (and the grounded fair price, if any) into the request
/// composer. A full navigation so PostJobForm re-mounts and reads ?brief/?budget.
function requestHref(query: string, read: ApiMarketRead): string {
  const params = new URLSearchParams({ brief: query });
  if (read.fairPriceUsdc != null) params.set('budget', String(Math.round(read.fairPriceUsdc)));
  return `/buyer?${params.toString()}`;
}

export function MarketScout() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [read, setRead] = useState<ApiMarketRead | null>(null);
  const [creditUsdc, setCreditUsdc] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsCredit, setNeedsCredit] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  async function runScout() {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setNeedsCredit(false);
    try {
      const res = await api.scoutMarket({ query: q });
      setRead(res.read);
      setCreditUsdc(res.creditUsdc);
      setLastQuery(q);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 402) {
          setNeedsCredit(true);
          setError('Activate agent research to scout the market.');
        } else if (err.status === 429) {
          setError('Up to 5 market scouts an hour. Try again shortly.');
        } else {
          setError(err.message || 'Scout failed. Try again.');
        }
      } else {
        setError('Scout failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-5" style={CARD_STYLE}>
      <div className="flex items-center justify-between gap-3">
        <span className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:SCOUT THE MARKET:]
        </span>
        {creditUsdc != null && (
          <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            credit ${creditUsdc.toFixed(2)}
          </span>
        )}
      </div>
      <p className="mt-2 text-[12px] leading-snug text-[var(--lp-text-sub)]">
        A live market read on any topic. Your agent pays for fresh web research and
        prices it for you.
      </p>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runScout();
        }}
        rows={2}
        placeholder="2,000 units custom packaging, Lagos to Dubai"
        className="mt-3 w-full resize-none rounded-lg border border-[var(--lp-border-light)] bg-[var(--lp-bg)] px-3 py-2 text-[13px] leading-snug text-[var(--lp-dark)] outline-none focus:border-[var(--lp-accent)]"
      />
      <button
        type="button"
        onClick={runScout}
        disabled={loading || query.trim().length === 0}
        className="mt-3 w-full rounded-lg bg-[var(--lp-accent)] px-4 py-2 mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-dark)] transition disabled:opacity-45"
      >
        {loading ? 'scouting…' : 'scout demand'}
      </button>

      {error && (
        <p className="mt-3 text-[11px] leading-snug text-[var(--lp-text-sub)]">
          {error}
          {needsCredit && (
            <>
              {' '}
              <Link href="/profile" className="underline underline-offset-2">
                Activate agent research
              </Link>
              .
            </>
          )}
        </p>
      )}

      {read && (
        <div className="mt-4">
          <MarketReadCard mr={toCardData(read)} />
          <a
            href={requestHref(lastQuery, read)}
            className="mt-3 inline-block mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-dark)] underline underline-offset-2"
          >
            start a request with this →
          </a>
        </div>
      )}
    </div>
  );
}
