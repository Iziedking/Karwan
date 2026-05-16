'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type Listing, type MarketplaceBrief } from '@/core/api';
import { shortAddress, formatUsdc, relativeTime } from '@/shared/utils/format';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  PageCard,
} from '@/shared/components/Bands';

type Side = 'all' | 'offers' | 'briefs';

/// A unified marketplace card type so the grid renders briefs and listings
/// side by side. `side: "offer"` = a seller's listing; `side: "brief"` = a
/// buyer's open brief. The agent works for whichever side you're on.
interface Card {
  side: 'offer' | 'brief';
  id: string;
  href: string;
  title: string;
  body: string;
  priceUsdc: number;
  priceLabel: string;
  postedAt: number;
  partyShort: string;
  partyRole: string;
  partyIsYou: boolean;
  matched: boolean;
  meta?: string;
}

export function ListingsBrowse() {
  const { address } = useAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [briefs, setBriefs] = useState<MarketplaceBrief[] | null>(null);
  const [error, setError] = useState(false);
  const [side, setSide] = useState<Side>('all');

  useEffect(() => {
    let cancelled = false;
    function load() {
      Promise.allSettled([api.listings(), api.marketplaceBriefs()]).then(([l, b]) => {
        if (cancelled) return;
        if (l.status === 'fulfilled') setListings(l.value.listings);
        else setError(true);
        if (b.status === 'fulfilled') setBriefs(b.value.briefs);
        else setError(true);
      });
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const cards = useMemo<Card[]>(() => {
    if (!listings || !briefs) return [];
    const a = address?.toLowerCase();
    const now = Date.now();
    // Hide terminal listings from the public marketplace so cancelled or
    // expired offers don't clutter the discovery surface. Owners still see
    // them on their own /seller dashboard.
    const offerCards: Card[] = listings
      .filter((l) => !l.cancelledAt && (l.expiresAt ?? Infinity) > now)
      .map((l) => ({
        side: 'offer',
        id: l.id,
        href: `/listings/${l.id}`,
        title: l.title,
        body: l.description,
        priceUsdc: l.askingPriceUsdc,
        priceLabel: 'asking',
        postedAt: l.postedAt,
        partyShort: shortAddress(l.sellerUser),
        partyRole: 'SELLER',
        partyIsYou: !!a && l.sellerUser.toLowerCase() === a,
        matched: !!l.matchedAt,
      }));
    const briefCards: Card[] = briefs.map((b) => {
      const title =
        (b.briefText.split('\n')[0] || b.briefText).slice(0, 80) ||
        `Brief ${b.jobId.slice(0, 10)}`;
      const body = b.briefText.length > title.length ? b.briefText : '';
      return {
        side: 'brief',
        id: b.jobId,
        href: `/jobs/${b.jobId}`,
        title,
        body,
        priceUsdc: Number(b.budgetUsdc),
        priceLabel: 'budget',
        postedAt: b.postedAt,
        partyShort: b.buyer,
        partyRole: 'BUYER',
        partyIsYou: false,
        matched: false,
        meta: b.bidsCount > 0 ? `${b.bidsCount} bid${b.bidsCount === 1 ? '' : 's'}` : 'awaiting bids',
      };
    });
    return [...offerCards, ...briefCards].sort((x, y) => y.postedAt - x.postedAt);
  }, [listings, briefs, address]);

  const offersCount = cards.filter((c) => c.side === 'offer').length;
  const briefsCount = cards.filter((c) => c.side === 'brief').length;
  const shown = cards.filter((c) => {
    if (side === 'offers') return c.side === 'offer';
    if (side === 'briefs') return c.side === 'brief';
    return true;
  });

  const loading = listings === null || briefs === null;
  const empty = !loading && shown.length === 0;

  const FILTERS: Array<{ key: Side; label: string; count: number }> = [
    { key: 'all', label: 'All', count: cards.length },
    { key: 'offers', label: 'Offers', count: offersCount },
    { key: 'briefs', label: 'Briefs', count: briefsCount },
  ];

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="fade-up">
          <SectionTag tone="dark" dot="live">
            MARKETPLACE
          </SectionTag>
        </div>
        <div className="fade-up fade-up-1 mt-5">
          <HeroHeadline>
            What sellers offer.{' '}
            <br className="hidden md:inline" />
            What buyers <Accent>need</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
        </div>
        <p className="fade-up fade-up-2 mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[52ch]">
          Live offers and live briefs on Karwan. Your agent watches both sides for you. when
          something matches your profile, it lands in your bell and your Telegram.
        </p>
      </Band>

      <Band tone="light" compact>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div
            className="inline-flex items-center gap-1 p-1"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 9,
              borderTopRightRadius: 9,
              borderBottomLeftRadius: 9,
              borderBottomRightRadius: 2,
            }}
          >
            {FILTERS.map((f) => {
              const active = side === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setSide(f.key)}
                  aria-pressed={active}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                  style={{
                    background: active ? 'var(--lp-card)' : 'transparent',
                    color: active ? 'var(--lp-dark)' : 'var(--lp-text-sub)',
                    border: active ? '1px solid var(--lp-border-light)' : '1px solid transparent',
                    borderTopLeftRadius: 7,
                    borderTopRightRadius: 7,
                    borderBottomLeftRadius: 7,
                    borderBottomRightRadius: 2,
                  }}
                >
                  {f.label}
                  <span className="tabular-nums opacity-70">{f.count}</span>
                </button>
              );
            })}
          </div>
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            LIVE FROM KARWAN
          </p>
        </div>

        {error && (
          <p className="py-12 text-center mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            Couldn&apos;t load the marketplace.
          </p>
        )}
        {loading && !error && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-44 bg-black/[0.05] rounded-2xl animate-pulse motion-reduce:animate-none"
              />
            ))}
          </div>
        )}
        {empty && (
          <PageCard>
            <div className="px-6 py-12 text-center space-y-2">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                {cards.length === 0 ? 'EMPTY MARKET' : 'NO MATCH'}
              </p>
              <p className="text-[13px] text-[var(--lp-text-sub)] max-w-[40ch] mx-auto leading-relaxed">
                {cards.length === 0
                  ? 'No offers or briefs yet. Post one to start the network.'
                  : `No ${side} right now.`}
              </p>
            </div>
          </PageCard>
        )}
        {!loading && !error && shown.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((c) => (
              <MarketCard key={`${c.side}-${c.id}`} card={c} />
            ))}
          </div>
        )}
      </Band>
    </FullBleed>
  );
}

function MarketCard({ card }: { card: Card }) {
  const sideTone = card.side === 'offer' ? '#0a7553' : '#b25425';
  const statusLabel = card.side === 'offer' ? (card.matched ? 'MATCHED' : 'OFFER') : 'BRIEF';
  const statusTone = card.matched ? 'var(--lp-accent)' : sideTone;
  return (
    <Link
      href={card.href}
      className="group relative overflow-hidden block transition-[transform,box-shadow] duration-300 ease-out card-shimmer hover:-translate-y-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.10)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_28px_60px_-22px_rgba(0,0,0,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 5,
      }}
    >
      <div className="px-5 pt-5 pb-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 mono text-[9px] font-bold uppercase tracking-[0.18em] px-1.5 py-1 border"
            style={{
              color: statusTone,
              borderColor: `${statusTone}55`,
              background: `${statusTone}14`,
              borderRadius: 4,
            }}
          >
            <span
              aria-hidden
              className="w-[5px] h-[5px]"
              style={{ background: statusTone }}
            />
            {statusLabel}
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] tabular-nums">
            {relativeTime(card.postedAt)}
          </span>
        </div>
        <h3 className="font-sans text-[19px] font-extrabold tracking-[-0.015em] leading-tight text-[var(--lp-dark)] line-clamp-2">
          {card.title}
        </h3>
        {card.body && (
          <p className="text-[13px] text-[var(--lp-text-sub)] line-clamp-2 leading-relaxed">
            {card.body}
          </p>
        )}
        {card.meta && (
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {card.meta}
          </p>
        )}
      </div>
      <div
        className="px-5 py-3 border-t border-[var(--lp-border-light)] flex items-baseline justify-between gap-3"
        style={{ background: 'var(--lp-light)' }}
      >
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-sans text-[22px] font-extrabold tabular-nums tracking-[-0.01em] leading-none text-[var(--lp-dark)]">
            {formatUsdc(card.priceUsdc, { withSuffix: false })}
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            USDC {card.priceLabel}
          </span>
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-[var(--lp-text-muted)] shrink-0">
          {card.partyRole} {card.partyShort}
          {card.partyIsYou && (
            <span style={{ color: 'var(--lp-accent)' }}> · you</span>
          )}
        </span>
      </div>
    </Link>
  );
}
