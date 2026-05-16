'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, type DirectDeal } from '@/core/api';
import { shortAddress, formatUsdc, relativeTime } from '@/shared/utils/format';

type EventKind = 'opened' | 'completed' | 'cancelled';

interface TickerCard {
  jobId: string;
  kind: EventKind;
  actor: string;
  counterparty: string;
  amountUsdc: string;
  at: number;
}

/// Public evidence ticker. Builds one card per deal based on its terminal state
/// or its last meaningful transition, then loops them horizontally as a Phantom-
/// style sliding track. The aim is "trades are happening", not action. cards
/// don't link anywhere. Pauses on hover so a passing eye can read a card.
export function NetworkTicker() {
  const [deals, setDeals] = useState<DirectDeal[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api
        .dealsFeed()
        .then((r) => {
          if (!cancelled) setDeals(r.deals);
        })
        .catch(() => {
          if (!cancelled) setDeals([]);
        });
    }
    load();
    // Refresh every 30s so a newly-opened or settled deal pops into rotation.
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const cards = useMemo<TickerCard[]>(() => {
    if (!deals) return [];
    const out: TickerCard[] = deals.map((d) => {
      const settled = d.onChain?.state === 2 || !!d.settledAt;
      if (d.cancelledAt) {
        return {
          jobId: d.jobId,
          kind: 'cancelled',
          actor: d.buyer,
          counterparty: d.seller,
          amountUsdc: d.dealAmountUsdc,
          at: d.cancelledAt,
        };
      }
      if (settled) {
        return {
          jobId: d.jobId,
          kind: 'completed',
          actor: d.seller,
          counterparty: d.buyer,
          amountUsdc: d.dealAmountUsdc,
          at: d.settledAt ?? d.updatedAt,
        };
      }
      return {
        jobId: d.jobId,
        kind: 'opened',
        actor: d.buyer,
        counterparty: d.seller,
        amountUsdc: d.dealAmountUsdc,
        at: d.acceptedAt ?? d.createdAt,
      };
    });
    // Newest first, then trim to a sensible track length.
    return out.sort((a, b) => b.at - a.at).slice(0, 14);
  }, [deals]);

  // Brand fallback when the feed is empty. keep the rail visible during the
  // quiet hours rather than collapsing the section.
  const fallback: TickerCard[] = [
    { jobId: '0x', kind: 'opened', actor: '0x0000', counterparty: '0x0000', amountUsdc: '50', at: 0 },
    { jobId: '0x', kind: 'completed', actor: '0x0000', counterparty: '0x0000', amountUsdc: '100', at: 0 },
    { jobId: '0x', kind: 'cancelled', actor: '0x0000', counterparty: '0x0000', amountUsdc: '200', at: 0 },
  ];

  const track = cards.length > 0 ? cards : fallback;
  // Duplicate the track so translateX(-50%) lands on a seamless loop boundary.
  const loop = [...track, ...track];
  // Cap animation duration so a short track doesn't fly by; longer tracks ease.
  const seconds = Math.max(28, track.length * 5);

  return (
    <div
      className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden"
      style={{ background: 'var(--lp-dark)' }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 z-10 w-24 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, var(--lp-dark) 0%, rgba(14,14,14,0) 100%)',
        }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 z-10 w-24 pointer-events-none"
        style={{
          background:
            'linear-gradient(270deg, var(--lp-dark) 0%, rgba(14,14,14,0) 100%)',
        }}
      />
      <div
        className="flex w-max items-stretch gap-4 py-8 px-6 ticker-track"
        style={{
          animation: `marquee ${seconds}s linear infinite`,
        }}
      >
        {loop.map((c, i) => (
          <TickerCardView key={`${c.jobId}-${i}`} card={c} muted={track === fallback} />
        ))}
      </div>
    </div>
  );
}

function TickerCardView({ card, muted }: { card: TickerCard; muted: boolean }) {
  const eyebrow =
    card.kind === 'opened'
      ? 'JUST OPENED'
      : card.kind === 'completed'
        ? 'JUST COMPLETED'
        : 'JUST CANCELLED';
  const eyebrowColor =
    card.kind === 'opened'
      ? 'var(--lp-accent)'
      : card.kind === 'completed'
        ? '#7fe0a8'
        : '#e8806b';
  const verb =
    card.kind === 'opened'
      ? 'opened a'
      : card.kind === 'completed'
        ? 'closed a'
        : 'cancelled a';

  return (
    <div
      className="relative shrink-0 overflow-hidden flex flex-col justify-between"
      style={{
        width: 296,
        height: 132,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 4,
        opacity: muted ? 0.55 : 1,
      }}
    >
      <div className="px-5 pt-4 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 mono text-[9px] font-bold uppercase tracking-[0.20em]"
          style={{ color: eyebrowColor }}
        >
          <span
            aria-hidden
            className="w-[5px] h-[5px]"
            style={{ background: eyebrowColor }}
          />
          {eyebrow}
        </span>
        {!muted && card.at > 0 && (
          <span className="mono text-[9px] uppercase tracking-[0.14em] text-white/45 tabular-nums">
            {relativeTime(card.at)}
          </span>
        )}
      </div>

      <div className="px-5 pb-4">
        <p className="mono text-[11px] tabular-nums text-white/65 leading-snug">
          <span className="text-white">{shortAddress(card.actor)}</span>{' '}
          <span className="text-white/55">{verb}</span>
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span
            className="font-sans text-[28px] font-extrabold tabular-nums tracking-[-0.02em] leading-none"
            style={{ color: 'white' }}
          >
            {formatUsdc(card.amountUsdc, { withSuffix: false })}
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-white/55">
            USDC deal
          </span>
        </div>
      </div>
    </div>
  );
}
