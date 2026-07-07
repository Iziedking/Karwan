'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { isBusinessAccount } from '@/features/account/accountKind';
import { api, type Listing, type MarketplaceBrief } from '@/core/api';
import { shortAddress, formatUsdc, relativeTime } from '@/shared/utils/format';
import { SignInGate } from '@/shared/components/SignInGate';
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
import { PageTour } from '@/shared/guide/PageTour';
import { MARKET_TOUR_ID, MARKET_BIZ_TOUR_ID, buildMarketSteps } from '@/shared/guide/tours';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

type CardVariant = 'default' | 'summary' | 'hiring';

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
  tradeLane?: 'service' | 'finance';
  partyKind?: 'person' | 'business';
}

export function ListingsBrowse() {
  const lb = useTranslations().listingsBrowse;
  const homeHero = useTranslations().appHome.hero;
  const { address, isAuthenticated, isLoading } = useAuth();
  /// The market is sectioned by rail (see buckets below). A business sees the
  /// B2B view; an individual sees the P2P view plus a read-only B2B strip. Keyed
  /// on the account kind so it matches the nav and the rest of the app.
  const { profile } = useUserProfile();
  const onBusinessTrack = isBusinessAccount(profile);
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [briefs, setBriefs] = useState<MarketplaceBrief[] | null>(null);
  const [error, setError] = useState(false);

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
        priceLabel: lb.card.priceLabelAsking,
        postedAt: l.postedAt,
        partyShort: shortAddress(l.sellerUser),
        partyRole: lb.card.partyRoleSeller,
        partyIsYou: !!a && l.sellerUser.toLowerCase() === a,
        matched: !!l.matchedAt,
        tradeLane: l.tradeLane,
        partyKind: l.partyKind,
      }));
    const briefCards: Card[] = briefs.map((b) => {
      const title =
        (b.briefText.split('\n')[0] || b.briefText).slice(0, 80) ||
        `Request ${b.jobId.slice(0, 10)}`;
      const body = b.briefText.length > title.length ? b.briefText : '';
      const metaCopy =
        b.bidsCount === 0
          ? lb.card.metaAwaitingBids
          : b.bidsCount === 1
            ? lb.card.metaBidOne
            : lb.card.metaBidsTemplate.replace('{n}', String(b.bidsCount));
      return {
        side: 'brief',
        id: b.jobId,
        href: `/jobs/${b.jobId}`,
        title,
        body,
        priceUsdc: Number(b.budgetUsdc),
        priceLabel: lb.card.priceLabelBudget,
        postedAt: b.postedAt,
        partyShort: b.buyer,
        partyRole: lb.card.partyRoleBuyer,
        partyIsYou: false,
        matched: false,
        meta: metaCopy,
        tradeLane: b.tradeLane,
        partyKind: b.partyKind,
      };
    });
    return [...offerCards, ...briefCards].sort((x, y) => y.postedAt - x.postedAt);
  }, [listings, briefs, address]);

  /// The marketplace keeps the two rails separate and visible. Three buckets:
  ///  - P2P: pure person-to-person trades (service lane, not business-posted).
  ///  - Hiring: a business sourcing an individual service (the one sanctioned
  ///    bridge); individuals can bid on these like any request.
  ///  - B2B: finance-lane trade-finance deals. Public, but view-only from a
  ///    personal account, and actionable from a business one.
  const buckets = useMemo(() => {
    const hiring = cards.filter((c) => c.partyKind === 'business' && c.tradeLane === 'service');
    const b2b = cards.filter((c) => c.tradeLane === 'finance');
    const p2p = cards.filter((c) => c.tradeLane !== 'finance' && c.partyKind !== 'business');
    return { hiring, b2b, p2p };
  }, [cards]);

  type Section = { key: string; title: string; note: string; cards: Card[]; variant: CardVariant };
  const sections = useMemo<Section[]>(() => {
    if (onBusinessTrack) {
      return [
        { key: 'b2b', title: 'Business deals', note: 'Open trade-finance deals.', cards: buckets.b2b, variant: 'default' },
        { key: 'hiring', title: 'Hiring individuals', note: 'Businesses hiring individuals.', cards: buckets.hiring, variant: 'hiring' },
      ];
    }
    return [
      { key: 'p2p', title: 'Open trades', note: 'Requests and offers you can take.', cards: buckets.p2p, variant: 'default' },
      { key: 'hiring', title: 'Businesses hiring', note: 'Bid like any request.', cards: buckets.hiring, variant: 'hiring' },
      { key: 'b2b', title: 'Business deals', note: 'View-only from a personal account.', cards: buckets.b2b, variant: 'summary' },
    ];
  }, [onBusinessTrack, buckets]);

  const loading = listings === null || briefs === null;
  const totalShown = sections.reduce((n, s) => n + s.cards.length, 0);
  const empty = !loading && totalShown === 0;

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <SignInGate
        variant="page"
        tag={lb.signInTag}
        body={lb.signInBody}
      />
    );
  }

  return (
    <FullBleed>
      <PageTour
        id={onBusinessTrack ? MARKET_BIZ_TOUR_ID : MARKET_TOUR_ID}
        steps={buildMarketSteps(onBusinessTrack ? 'business' : 'person')}
      />
      <Band tone="dark" compact overlay={<GridOverlay />}>
        <div className="fade-up">
          <SectionTag tone="dark" dot="live">
            {lb.heroTag}
          </SectionTag>
        </div>
        <div className="fade-up fade-up-1 mt-4">
          <HeroHeadline size="sm">
            {lb.heroHeadlinePart1}{' '}
            <br className="hidden md:inline" />
            {lb.heroHeadlinePart2Prefix}
            <Accent>{lb.heroAccent}</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
        </div>
        <p className="fade-up fade-up-2 mt-4 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[52ch]">
          {lb.heroBody}
        </p>
      </Band>

      <Band tone="light" compact>
        <div className="flex flex-wrap items-center justify-end gap-4 mb-6">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {onBusinessTrack ? lb.businessFilterNote : lb.liveCaption}
          </p>
        </div>

        {error && (
          <p className="py-12 text-center mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {lb.error}
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
            <div className="px-6 py-12 text-center space-y-3">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                {lb.emptyAllTag}
              </p>
              <p className="text-[13px] text-[var(--lp-text-sub)] max-w-[40ch] mx-auto leading-relaxed">
                {lb.emptyAllBody}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1">
                <Link
                  href="/buyer"
                  className="mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-dark)] hover:text-[var(--lp-accent-hover)] transition-colors"
                >
                  {homeHero.postRequestCta}
                </Link>
                <Link
                  href="/seller"
                  className="mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-dark)] hover:text-[var(--lp-accent-hover)] transition-colors"
                >
                  {homeHero.postOfferCta}
                </Link>
              </div>
            </div>
          </PageCard>
        )}
        {!loading && !error && totalShown > 0 && (
          <div className="space-y-10">
            {sections
              .filter((s) => s.cards.length > 0)
              .map((s) => (
                <section key={s.key} data-guide={`market-${s.key}`}>
                  <div className="flex items-baseline justify-between gap-3 mb-4">
                    <h2 className="font-sans text-[17px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
                      {s.title}
                      <span className="ms-2 mono text-[11px] font-bold tabular-nums text-[var(--lp-text-muted)]">
                        {s.cards.length}
                      </span>
                    </h2>
                    <p className="hidden sm:block mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] text-end max-w-[40ch]">
                      {s.note}
                    </p>
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {s.cards.map((c) => (
                      <MarketCard
                        key={`${c.side}-${c.id}`}
                        card={c}
                        copy={lb.card}
                        variant={s.variant}
                      />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        )}
      </Band>
    </FullBleed>
  );
}

function MarketCard({
  card,
  copy,
  variant = 'default',
}: {
  card: Card;
  copy: Messages['listingsBrowse']['card'];
  variant?: CardVariant;
}) {
  const isSummary = variant === 'summary';
  const isHiring = variant === 'hiring';
  const statusLabel = isHiring
    ? 'Hiring · Business'
    : isSummary
      ? 'Business deal'
      : card.matched
        ? copy.statusMatched
        : card.side === 'offer'
          ? copy.statusOffer
          : copy.statusRequest;
  // One accent per view: lime marks a matched card; every other state stays
  // neutral, since the label text already says offer / request / hiring / deal.
  const statusTone = card.matched ? 'var(--lp-accent)' : 'var(--lp-text-muted)';

  const cardStyle = {
    background: 'var(--lp-card)',
    border: '1px solid var(--lp-border-light)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 5,
  } as const;

  // A view-only B2B summary is not actionable from a personal account, so it is
  // a plain div (no link, no hover lift) and never shows the counterparty.
  const inner = (
    <>
      <div className="px-5 pt-5 pb-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 mono text-[9px] font-bold uppercase tracking-[0.18em]"
            style={{ color: statusTone }}
          >
            <span aria-hidden className="w-[6px] h-[6px]" style={{ background: statusTone }} />
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
            {copy.priceUnitTemplate.replace('{label}', card.priceLabel)}
          </span>
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-[var(--lp-text-muted)] shrink-0">
          {isSummary || isHiring ? (
            'Business'
          ) : (
            <>
              {card.partyRole} {card.partyShort}
              {card.partyIsYou && (
                <span style={{ color: 'var(--lp-accent)' }}>{copy.selfSuffix}</span>
              )}
            </>
          )}
        </span>
      </div>
    </>
  );

  if (isSummary) {
    return (
      <div
        className="relative overflow-hidden block"
        style={{ ...cardStyle, opacity: 0.9 }}
        aria-label="Business deal, view only"
      >
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={card.href}
      className="group relative overflow-hidden block transition-[transform,box-shadow] duration-300 ease-out card-shimmer hover:-translate-y-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.10)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_28px_60px_-22px_rgba(0,0,0,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
      style={cardStyle}
    >
      {inner}
    </Link>
  );
}
