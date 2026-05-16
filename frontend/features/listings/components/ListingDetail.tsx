'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { api, type Listing } from '@/core/api';
import { shortAddress, formatUsdc, relativeTime } from '@/shared/utils/format';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  PageCard,
  CTAPill,
} from '@/shared/components/Bands';

type FetchState = 'loading' | 'ok' | 'error';

export function ListingDetail({ listingId }: { listingId: string }) {
  const { address, isConnected } = useAccount();
  const [listing, setListing] = useState<Listing | null>(null);
  const [floor, setFloor] = useState<number | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');

  useEffect(() => {
    let cancelled = false;
    setFetchState('loading');
    api
      .getListing(listingId, address)
      .then((r) => {
        if (cancelled) return;
        setListing(r.listing);
        setFloor(r.floor ?? null);
        setFetchState('ok');
      })
      .catch(() => {
        if (!cancelled) setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [listingId, address]);

  if (fetchState === 'loading') {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="space-y-4 max-w-[44ch]">
            <div className="h-3 w-32 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
            <div className="h-12 w-72 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-48 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (fetchState === 'error' || !listing) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[48ch]">
            <SectionTag tone="dark">LISTING NOT FOUND</SectionTag>
            <HeroHeadline size="md">
              We couldn&apos;t load this listing<Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              The link may be wrong, or the listing has been removed.
            </p>
            <p className="mt-3 mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-white/45 break-all">
              {listingId}
            </p>
            <div className="mt-7">
              <CTAPill href="/seller">Back to seller desk</CTAPill>
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  const viewerIsOwner =
    !!address && address.toLowerCase() === listing.sellerUser.toLowerCase();
  const matched = !!listing.matchedAt && !!listing.matchedJobId;
  // Floor is the seller agent's private steering value. Backend strips it
  // for non-owners; we double-check on the client so a misconfigured payload
  // can't leak it.
  const showFloor = viewerIsOwner && floor != null;
  const statusLabel = matched ? 'Matched' : 'Open';
  const statusTone = matched ? 'var(--lp-accent)' : '#b0b0b0';
  // Buyer-side CTA: pre-fill the new-deal form with this seller + asking price
  // so anyone reading a listing can open a direct deal without copy-paste.
  const buyerOfferHref = isConnected
    ? `/buyer?seller=${listing.sellerUser}&amount=${listing.askingPriceUsdc}&terms=${encodeURIComponent(listing.title)}`
    : '/buyer';

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="fade-up">
          <Link
            href="/seller"
            className="group inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white transition-colors mb-6"
          >
            <span
              aria-hidden
              className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5"
            >
              ←
            </span>
            Back to seller
          </Link>
        </div>
        <div className="grid lg:grid-cols-[1.4fr_auto] gap-6 items-start">
          <div className="min-w-0">
            <div className="fade-up fade-up-1 flex items-center gap-3 flex-wrap">
              <SectionTag tone="dark" dot={matched ? undefined : 'live'}>
                LISTING
              </SectionTag>
              <span
                className="inline-flex items-center gap-1.5 mono text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 border"
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
            </div>
            <div className="fade-up fade-up-2 mt-6">
              <HeroHeadline>
                {listing.title}
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            <p className="fade-up fade-up-3 mt-4 mono text-[11px] uppercase tracking-[0.12em] text-white/45 tabular-nums">
              posted {relativeTime(listing.postedAt)}
            </p>
          </div>
          <div className="fade-up fade-up-4 flex items-baseline gap-2 shrink-0">
            <span className="font-sans text-[clamp(2.5rem,5vw,4rem)] font-extrabold tabular-nums tracking-[-0.025em] leading-none text-white">
              {formatUsdc(listing.askingPriceUsdc, { withSuffix: false })}
            </span>
            <span className="mono text-[12px] uppercase tracking-[0.12em] text-white/55">
              USDC
            </span>
          </div>
        </div>
      </Band>

      <Band tone="light" compact>
        <SectionTag>OFFER</SectionTag>
        <HeroHeadline size="md">
          The pitch<Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-8 grid md:grid-cols-2 gap-5">
          <PageCard>
            <div className="p-6 md:p-7">
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] whitespace-pre-wrap">
                {listing.description}
              </p>
            </div>
          </PageCard>
          <PageCard>
            <div className="p-6 md:p-7 space-y-4">
              <PriceRow label="Asking" value={listing.askingPriceUsdc} strong />
              {showFloor && (
                <>
                  <PriceRow
                    label={`Your floor (${listing.negotiationMaxDecreasePct ?? 0}% accept)`}
                    value={floor!}
                  />
                  <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)] leading-snug">
                    [:PRIVATE:] only you see this. Your agent uses it to steer counters.
                  </p>
                </>
              )}
              <div className="pt-3 border-t border-[var(--lp-border-light)] space-y-2">
                <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                  [:SELLER:]
                </p>
                <p className="mono text-[13px] text-[var(--lp-dark)] tabular-nums">
                  {shortAddress(listing.sellerUser)}
                  {viewerIsOwner && (
                    <span style={{ color: 'var(--lp-accent)' }}> · you</span>
                  )}
                </p>
              </div>
            </div>
          </PageCard>
        </div>
      </Band>

      <Band tone="dark" compact>
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
          <div className="max-w-[42ch]">
            <SectionTag tone="dark" dot={matched ? undefined : 'live'}>
              {matched ? 'MATCHED' : viewerIsOwner ? 'SCANNING' : 'OPEN'}
            </SectionTag>
            <HeroHeadline size="md">
              {matched ? (
                <>Brief landed<Punc>.</Punc></>
              ) : viewerIsOwner ? (
                <>Agent is watching<Punc>.</Punc></>
              ) : (
                <>Open a deal<Punc>.</Punc></>
              )}
            </HeroHeadline>
          </div>
          <div
            className="overflow-hidden p-6 md:p-7"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderBottomLeftRadius: 22,
              borderBottomRightRadius: 5,
            }}
          >
            {matched ? (
              <div className="space-y-4">
                <p className="text-[14px] leading-relaxed text-white/70">
                  Your agent bid on a matching brief. The auction continues on the job page.
                </p>
                <CTAPill href={`/jobs/${listing.matchedJobId}`}>Open matched job</CTAPill>
              </div>
            ) : viewerIsOwner ? (
              <p className="text-[14px] leading-relaxed text-white/70">
                The seller agent watches every brief that lands. When one matches this listing
                and the price gap is crossable, it bids automatically. You will get a
                notification the moment that happens.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-[14px] leading-relaxed text-white/70">
                  This listing is open. Open a direct deal with this seller at the asking
                  price. Escrow funds when they accept.
                </p>
                <CTAPill href={buyerOfferHref}>Open a deal at {listing.askingPriceUsdc} USDC</CTAPill>
              </div>
            )}
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}

function PriceRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-[var(--lp-text-sub)]">{label}</span>
      <span
        className={`mono tabular-nums ${
          strong
            ? 'text-[18px] font-extrabold text-[var(--lp-dark)]'
            : 'text-[14px] text-[var(--lp-dark)]'
        }`}
      >
        {formatUsdc(value)}
      </span>
    </div>
  );
}
