'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { api, type DirectDeal } from '@/core/api';
import { formatUsdc, relativeTime } from '@/shared/utils/format';
import { BracketTag, type BracketTagVariant } from '@/shared/components/skill';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
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
      className="relative left-1/2 w-bleed -translate-x-1/2"
      style={{ background: 'var(--lp-workspace-band)' }}
    >
      {/* The band is full-bleed, the movement is not. The track used to run
          edge to edge of the viewport while every other row on the page sits in
          the 1440px measure, so cards slid out from under the window frame
          instead of out of the column of content. The measure and the padding
          are the same ones `Band` uses, so the first card lines up with the stat
          tiles above it. */}
      <div className="relative mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)]">
        <div className="relative overflow-hidden">
          {/* Side fades track the workspace canvas so the loop disappears at
              the edge without adding a dark strip in light mode. */}
          <span
            aria-hidden
            className="absolute inset-y-0 start-0 z-10 w-12 pointer-events-none sm:w-16"
            style={{
              background:
                'linear-gradient(90deg, var(--lp-workspace-band) 0%, transparent 100%)',
            }}
          />
          <span
            aria-hidden
            className="absolute inset-y-0 end-0 z-10 w-12 pointer-events-none sm:w-16"
            style={{
              background:
                'linear-gradient(270deg, var(--lp-workspace-band) 0%, transparent 100%)',
            }}
          />
          {/* No horizontal padding on the track: it would offset the loop
              boundary that translateX(-50%) depends on, and the measure around
              it already provides the inset. */}
          <div
            className="flex w-max items-stretch gap-4 py-8 ticker-track"
            style={{
              animation: `marquee ${seconds}s linear infinite`,
            }}
          >
            {loop.map((c, i) => (
              <TickerCardView key={`${c.jobId}-${i}`} card={c} muted={track === fallback} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TickerCardView({ card, muted }: { card: TickerCard; muted: boolean }) {
  const t = useTranslations().networkTicker;
  const eyebrow = t.eyebrows[card.kind];
  // Map state to skill BracketTag variant + tone color for the left rail.
  const variant: BracketTagVariant =
    card.kind === 'opened' ? 'live' : card.kind === 'completed' ? 'pos' : 'neg';
  const railColor =
    card.kind === 'opened'
      ? 'var(--accent)'
      : card.kind === 'completed'
        ? 'var(--pos)'
        : 'var(--neg)';
  const verb = t.verbs[card.kind];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: dur.fast, ease: ease.out }}
      className="group relative shrink-0 overflow-hidden flex flex-col justify-between"
      style={{
        width: 296,
        height: 144,
        background: 'var(--lp-workspace-raised)',
        border: '1px solid var(--lp-workspace-border)',
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
        className="absolute start-0 top-0 bottom-0 w-[3px]"
        style={{ background: railColor }}
      />
      {/* faint corner grid pattern, brightens on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(var(--lp-workspace-grid) 1px, transparent 1px), linear-gradient(90deg, var(--lp-workspace-grid) 1px, transparent 1px)',
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
          border: '1px solid var(--lp-workspace-border)',
        }}
      />

      <div className="relative px-5 pt-4 ps-6 flex items-center justify-between">
        <BracketTag variant={variant} onDark={false}>
          {eyebrow}
        </BracketTag>
        {!muted && card.at > 0 && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums"
            style={{ color: 'var(--lp-workspace-faint)' }}
          >
            {relativeTime(card.at)}
          </span>
        )}
      </div>

      <div className="relative px-5 pb-5 ps-6">
        <p
          className="font-mono text-[11px] tabular-nums leading-snug"
          style={{ color: 'var(--lp-workspace-muted)' }}
        >
          <span style={{ color: 'var(--lp-workspace-ink)' }}>{t.subjects[card.kind]}</span>{' '}
          <span style={{ color: 'var(--lp-workspace-faint)' }}>{verb}</span>
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className="font-sans font-bold tabular-nums tracking-[-0.03em] leading-none"
            style={{
              fontSize: 'clamp(32px, 3.6vw, 40px)',
              color: 'var(--lp-workspace-ink)',
            }}
          >
            {formatUsdc(card.amountUsdc, { withSuffix: false })}
          </span>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--lp-workspace-faint)' }}
          >
            {t.usdcDeal}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
