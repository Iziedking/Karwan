'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { api, type DirectDeal } from '@/core/api';
import { shortAddress, formatUsdc, relativeTime } from '@/shared/utils/format';
import { BracketTag, type BracketTagVariant } from '@/shared/components/skill';
import { dur, ease } from '@/shared/motion/tokens';

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
      className="relative left-1/2 w-bleed -translate-x-1/2 overflow-hidden"
      style={{ background: 'var(--lp-band-dark)' }}
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
  // Map state to skill BracketTag variant + tone color for the left rail.
  const variant: BracketTagVariant =
    card.kind === 'opened' ? 'live' : card.kind === 'completed' ? 'pos' : 'neg';
  const railColor =
    card.kind === 'opened'
      ? 'var(--accent)'
      : card.kind === 'completed'
        ? 'var(--pos)'
        : 'var(--neg)';
  const verb =
    card.kind === 'opened'
      ? 'opened a'
      : card.kind === 'completed'
        ? 'closed a'
        : 'cancelled a';

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: dur.fast, ease: ease.out }}
      className="group relative shrink-0 overflow-hidden flex flex-col justify-between"
      style={{
        width: 296,
        height: 144,
        background: 'var(--surface-1)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 4,
        opacity: muted ? 0.5 : 1,
        transition: 'border-color 240ms cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* state rail on the left edge per skill grammar */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: railColor }}
      />
      {/* faint corner grid pattern, brightens on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage:
            'radial-gradient(ellipse 70% 70% at 100% 0%, black, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 70% at 100% 0%, black, transparent 75%)',
        }}
      />
      {/* hover hairline brighten per skill §3 motion rule 3 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100"
        style={{
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.18)',
        }}
      />

      <div className="relative px-5 pt-4 pl-6 flex items-center justify-between">
        <BracketTag variant={variant} onDark>
          {eyebrow}
        </BracketTag>
        {!muted && card.at > 0 && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums"
            style={{ color: 'var(--ink-3)' }}
          >
            {relativeTime(card.at)}
          </span>
        )}
      </div>

      <div className="relative px-5 pb-5 pl-6">
        <p
          className="font-mono text-[11px] tabular-nums leading-snug"
          style={{ color: 'var(--ink-2)' }}
        >
          <span style={{ color: 'var(--ink-1)' }}>{shortAddress(card.actor)}</span>{' '}
          <span style={{ color: 'var(--ink-3)' }}>{verb}</span>
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className="font-sans font-bold tabular-nums tracking-[-0.03em] leading-none"
            style={{
              fontSize: 'clamp(32px, 3.6vw, 40px)',
              color: 'var(--ink-1)',
            }}
          >
            {formatUsdc(card.amountUsdc, { withSuffix: false })}
          </span>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--ink-3)' }}
          >
            USDC DEAL
          </span>
        </div>
      </div>
    </motion.div>
  );
}
