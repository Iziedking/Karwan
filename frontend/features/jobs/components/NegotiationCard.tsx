'use client';
import { useState } from 'react';
import type { BuyerJob, ChainEvent, MatchProposal } from '@/core/api';
import { formatUsdc } from '@/shared/utils/format';
import { SectionTag, PageCard } from '@/shared/components/Bands';
import { EventList } from './EventList';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { formatMatchingTimestamp, presentMatchingState } from '../matchingPresentation';
import { latestStructuredOffer } from '../structuredOfferPresentation';

// Mirrors the backend default NEGOTIATION_MAX_ROUNDS_PER_SIDE. Display-only:
// a soft cap shown beside the round counter, not enforced here.
const SOFT_ROUND_CAP = 5;
// How many price points to show before collapsing the older ones behind a lead
// ellipsis. Three keeps the walk readable on a phone.
const MAX_CHIPS = 3;

const SIDE_COLOR: Record<Side, string> = { buyer: '#3a4a85', seller: 'var(--lp-accent)' };

type Side = 'buyer' | 'seller';
interface PricePoint {
  side: Side;
  price: string;
  accepted?: boolean;
}

/// Reads the chronological price moves out of the live event stream. Each bid,
/// counter, and response is one point on the walk; the last point is what's on
/// the table right now. useLiveEvents delivers newest-first, so we sort up.
function priceWalk(events: ChainEvent[]): PricePoint[] {
  const chrono = [...events].sort((a, b) => a.ts - b.ts);
  const points: PricePoint[] = [];
  for (const e of chrono) {
    const p = e.payload ?? {};
    if (e.type === 'bid.submitted' && p.priceUsdc != null) {
      points.push({ side: 'seller', price: String(p.priceUsdc) });
    } else if (e.type === 'counter.issued' && (p.counterPriceUsdc ?? p.counterPrice) != null) {
      points.push({ side: 'buyer', price: String(p.counterPriceUsdc ?? p.counterPrice) });
    } else if (e.type === 'counter.response.submitted' && (p.priceUsdc ?? p.counterPrice) != null) {
      points.push({ side: 'seller', price: String(p.priceUsdc ?? p.counterPrice) });
    } else if (e.type === 'bid.accepted' && p.priceUsdc != null) {
      points.push({ side: 'buyer', price: String(p.priceUsdc), accepted: true });
    }
  }
  return points;
}

export function NegotiationCard({
  events,
  explorer,
  job,
  proposal,
  viewerAddress,
}: {
  events: ChainEvent[];
  explorer: string;
  job: Pick<BuyerJob, 'finalized' | 'escrowFunded' | 'expiredAt'>;
  proposal?: MatchProposal | null;
  viewerAddress?: string | null;
}) {
  const { locale, t } = useLocale();
  const nc = t.negotiationCard;
  const [open, setOpen] = useState(false);
  const walk = priceWalk(events);
  const presentation = presentMatchingState({
    events,
    job,
    proposal,
    viewerAddress,
    viewerRole: 'buyer',
  });
  const structuredOffer = latestStructuredOffer(events);
  const stateCopy = nc.states[presentation.state];
  const accepted =
    presentation.state === 'funding_ready' ||
    presentation.state === 'settling' ||
    presentation.state === 'completed';
  const round = walk.length;
  const offerFreshness = presentation.currentOffer
    ? `${nc.offer[presentation.currentOffer.revision]} · ${nc.offer.updatedTemplate.replace(
        '{time}',
        formatMatchingTimestamp(presentation.currentOffer.updatedAt, locale),
      )}`
    : null;
  const structuredOfferFreshness = structuredOffer
    ? `${structuredOffer.version === 1 ? nc.offer.initial : nc.offer.changed} / ${nc.offer.updatedTemplate.replace(
        '{time}',
        formatMatchingTimestamp(structuredOffer.updatedAt, locale),
      )}`
    : null;
  const visibleOfferFreshness = structuredOfferFreshness ?? offerFreshness;

  const display = walk.length > MAX_CHIPS ? walk.slice(-MAX_CHIPS) : walk;
  const truncated = walk.length > MAX_CHIPS;

  return (
    <PageCard>
      <div
        className="px-6 pt-6 flex items-center justify-between gap-3"
        data-matching-state={presentation.state}
        data-matching-next-actor={presentation.nextActor}
      >
        <SectionTag dot={presentation.live ? 'live' : undefined}>
          {nc.tag} · {stateCopy.tag}
        </SectionTag>
        {round > 0 && !presentation.terminal && (
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] tabular-nums">
            {round <= SOFT_ROUND_CAP
              ? nc.roundOfCapTemplate
                  .replace('{n}', String(round))
                  .replace('{cap}', String(SOFT_ROUND_CAP))
              : nc.roundTemplate.replace('{n}', String(round))}
          </span>
        )}
      </div>

      <div className="px-6 pt-4 pb-6">
        <h3 className="font-sans text-[22px] md:text-[26px] font-extrabold tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
          {stateCopy.headline}
        </h3>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          {stateCopy.body}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          <span>{nc.nextActors[presentation.nextActor]}</span>
          {visibleOfferFreshness ? <span className="tabular-nums">{visibleOfferFreshness}</span> : null}
        </div>

        {structuredOffer ? (
          <div
            className="mt-6 border border-[var(--lp-border)] bg-[var(--lp-surface-raised)] px-4 py-4"
            data-structured-offer-id={structuredOffer.id}
            data-structured-offer-version={structuredOffer.version}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <span className="mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                {structuredOffer.version === 1 ? nc.offer.initial : nc.offer.changed}
              </span>
              <span className="font-sans text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-[var(--lp-dark)]">
                {formatUsdc(structuredOffer.amountUsdc, { withSuffix: false })}{' '}
                <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                  USDC
                </span>
              </span>
            </div>
          </div>
        ) : null}

        {display.length > 0 && (
          <div className="mt-6 flex flex-wrap items-end gap-x-2 gap-y-3">
            {truncated && (
              <span className="mono text-[14px] text-[var(--lp-text-muted)] pb-5">…</span>
            )}
            {display.map((pt, i) => {
              const isLast = i === display.length - 1;
              const label = isLast
                ? accepted
                  ? nc.chips.agreed
                  : nc.chips.standing
                : nc.chips[pt.side];
              return (
                <div key={i} className="flex items-end gap-2">
                  {i > 0 && (
                    <span aria-hidden className="mono text-[13px] text-[var(--lp-text-muted)] pb-5">
                      →
                    </span>
                  )}
                  <div className="flex flex-col items-start gap-1">
                    <span
                      className="font-sans font-extrabold tabular-nums tracking-[-0.02em] leading-none"
                      style={{
                        fontSize: isLast ? 30 : 22,
                        color: isLast ? 'var(--lp-dark)' : 'var(--lp-text-sub)',
                      }}
                    >
                      {formatUsdc(pt.price, { withSuffix: false })}
                    </span>
                    <span
                      className="mono text-[9px] font-bold uppercase tracking-[0.16em]"
                      style={{ color: isLast ? 'var(--lp-accent)' : SIDE_COLOR[pt.side] }}
                    >
                      {label}
                    </span>
                  </div>
                </div>
              );
            })}
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] pb-[7px]">
              USDC
            </span>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-[var(--lp-border-light)]">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="group inline-flex min-h-11 items-center gap-2 mono text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--lp-text-sub)] transition-colors hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
          >
            {open ? nc.timelineHide : nc.timelineShow}
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {open && (
            // Bounded, internally-scrolling: the timeline can run to dozens of
            // events on a busy auction; cap its height so it never stretches the
            // page, and let it scroll within instead.
            <div className="mt-4 max-h-[50vh] overflow-y-auto overscroll-contain [scrollbar-width:thin] pe-1">
              <EventList events={events} explorer={explorer} variant="card" />
            </div>
          )}
        </div>
      </div>
    </PageCard>
  );
}
