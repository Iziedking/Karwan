'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { api, type Listing, type ListingStatus } from '@/core/api';
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
  const router = useRouter();
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const [listing, setListing] = useState<Listing | null>(null);
  const [floor, setFloor] = useState<number | null>(null);
  const [status, setStatus] = useState<ListingStatus>('open');
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    let cancelledFetch = false;
    setFetchState('loading');
    api
      .getListing(listingId, address ?? undefined)
      .then((r) => {
        if (cancelledFetch) return;
        setListing(r.listing);
        setFloor(r.floor ?? null);
        setStatus(r.status);
        setFetchState('ok');
      })
      .catch(() => {
        if (!cancelledFetch) setFetchState('error');
      });
    return () => {
      cancelledFetch = true;
    };
  }, [listingId, address]);

  async function handleCancel() {
    if (!address || !listing) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const r = await api.cancelListing(listing.id, address);
      setListing(r.listing);
      setStatus('cancelled');
      setConfirmCancel(false);
    } catch (err) {
      setCancelError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  async function handleEdit(patch: {
    title?: string;
    description?: string;
    askingPriceUsdc?: number;
  }) {
    if (!address || !listing) return;
    setEditing(true);
    setEditError(null);
    try {
      const r = await api.editListing(listing.id, address, patch);
      setListing(r.listing);
      setShowEdit(false);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setEditing(false);
    }
  }

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
              We couldn&apos;t load this offer<Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              The link may be wrong, or the offer has been removed.
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
  const matched = status === 'matched';
  const isCancelled = status === 'cancelled';
  const isExpired = status === 'expired';
  const isOpen = status === 'open';
  const isTerminal = isCancelled || isExpired || matched;
  // Floor is the seller agent's private steering value. Backend strips it
  // for non-owners; we double-check on the client so a misconfigured payload
  // can't leak it.
  const showFloor = viewerIsOwner && floor != null;
  const statusLabel = isCancelled
    ? 'Cancelled'
    : isExpired
      ? 'Expired'
      : matched
        ? 'Matched'
        : 'Open';
  const statusTone = isCancelled
    ? '#b03d3a'
    : isExpired
      ? '#6b6b6b'
      : matched
        ? 'var(--lp-accent)'
        : '#b0b0b0';
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
              ←
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
            <SectionTag tone="dark" dot={isTerminal ? undefined : 'live'}>
              {isCancelled
                ? 'CANCELLED'
                : isExpired
                  ? 'EXPIRED'
                  : matched
                    ? 'MATCHED'
                    : viewerIsOwner
                      ? 'SCANNING'
                      : 'OPEN'}
            </SectionTag>
            <HeroHeadline size="md">
              {isCancelled ? (
                <>You called it off<Punc>.</Punc></>
              ) : isExpired ? (
                <>Offer window closed<Punc>.</Punc></>
              ) : matched ? (
                <>Request landed<Punc>.</Punc></>
              ) : viewerIsOwner ? (
                <>Agent is watching<Punc>.</Punc></>
              ) : (
                <>Open a deal<Punc>.</Punc></>
              )}
            </HeroHeadline>
            {isOpen && listing.expiresAt && (
              <p className="mt-4 mono text-[11px] uppercase tracking-[0.12em] text-white/45">
                Window closes {relativeTime(listing.expiresAt)}
              </p>
            )}
          </div>
          <div
            className="overflow-hidden p-6 md:p-7"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderBottomLeftRadius: 22,
              borderBottomRightRadius: 5,
            }}
          >
            {isCancelled ? (
              <p className="text-[14px] leading-relaxed text-white/70">
                You cancelled this offer. It no longer scans for matches and won&apos;t accept
                bids. Post a new offer if you want to offer again.
              </p>
            ) : isExpired ? (
              listing.matchedJobId ? (
                <div className="space-y-4">
                  <p className="text-[14px] leading-relaxed text-white/70">
                    The matching window has closed. Your agent did match a request and bid
                    on it, but the buyer did not accept before the window expired. Open the
                    matched job to see how it played out, or post a new offer.
                  </p>
                  <CTAPill href={`/jobs/${listing.matchedJobId}`}>Open matched job</CTAPill>
                </div>
              ) : (
                <p className="text-[14px] leading-relaxed text-white/70">
                  The matching window has closed. No bid landed in time. Post a new offer to put
                  it back in front of buyer agents.
                </p>
              )
            ) : matched ? (
              <div className="space-y-4">
                <p className="text-[14px] leading-relaxed text-white/70">
                  Your agent bid on a matching request. The auction continues on the job page.
                </p>
                <CTAPill href={`/jobs/${listing.matchedJobId}`}>Open matched job</CTAPill>
              </div>
            ) : viewerIsOwner ? (
              <div className="space-y-4">
                <p className="text-[14px] leading-relaxed text-white/70">
                  The seller agent watches every request that lands. When one matches this offer
                  and the price gap is crossable, it bids automatically. You will get a
                  notification the moment that happens.
                </p>
                {!confirmCancel ? (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <button
                      type="button"
                      onClick={() => setShowEdit(true)}
                      className="mono text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--lp-accent)] hover:text-[var(--lp-accent-hover)] underline underline-offset-2"
                    >
                      Edit this offer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(true)}
                      className="mono text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55 hover:text-white underline underline-offset-2"
                    >
                      Cancel this offer
                    </button>
                  </div>
                ) : (
                  <div
                    className="px-4 py-3 space-y-3"
                    style={{
                      background: 'rgba(176, 61, 58, 0.12)',
                      border: '1px solid rgba(176, 61, 58, 0.35)',
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 3,
                    }}
                  >
                    <p className="text-[13px] text-white/85 leading-snug">
                      Cancel this offer? It drops out of every match scanner immediately.
                      Cannot be undone. Post fresh if you change your mind.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="mono text-[11px] font-bold uppercase tracking-[0.10em] px-3.5 py-2 text-white transition-colors disabled:opacity-60"
                        style={{
                          background: '#b03d3a',
                          borderTopLeftRadius: 8,
                          borderTopRightRadius: 8,
                          borderBottomLeftRadius: 8,
                          borderBottomRightRadius: 2,
                        }}
                      >
                        {cancelling ? 'Cancelling...' : 'Yes, cancel'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(false)}
                        disabled={cancelling}
                        className="mono text-[11px] uppercase tracking-[0.10em] text-white/70 hover:text-white"
                      >
                        Keep listed
                      </button>
                    </div>
                    {cancelError && (
                      <p className="mono text-[11px] text-[#ff8a7a]">{cancelError}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[14px] leading-relaxed text-white/70">
                  This offer is open. Open a direct deal with this seller at the asking
                  price. Escrow funds when they accept.
                </p>
                <CTAPill href={buyerOfferHref}>Open a deal at {listing.askingPriceUsdc} USDC</CTAPill>
              </div>
            )}
          </div>
        </div>
      </Band>
      {showEdit && (
        <EditListingModal
          initialTitle={listing.title}
          initialDescription={listing.description}
          initialAskingPriceUsdc={listing.askingPriceUsdc}
          busy={editing}
          error={editError}
          onSave={handleEdit}
          onClose={() => {
            setShowEdit(false);
            setEditError(null);
          }}
        />
      )}
    </FullBleed>
  );
}

function EditListingModal({
  initialTitle,
  initialDescription,
  initialAskingPriceUsdc,
  busy,
  error,
  onSave,
  onClose,
}: {
  initialTitle: string;
  initialDescription: string;
  initialAskingPriceUsdc: number;
  busy: boolean;
  error: string | null;
  onSave: (patch: { title?: string; description?: string; askingPriceUsdc?: number }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [price, setPrice] = useState<number | ''>(initialAskingPriceUsdc);
  const titleChanged = title.trim() !== initialTitle;
  const descChanged = description.trim() !== initialDescription;
  const priceChanged = typeof price === 'number' && price !== initialAskingPriceUsdc;
  const dirty = titleChanged || descChanged || priceChanged;
  const titleValid = title.trim().length >= 3 && title.trim().length <= 120;
  const descValid = description.trim().length >= 5 && description.trim().length <= 500;
  const priceValid = typeof price === 'number' && price > 0 && price <= 5_000_000;
  const valid = titleValid && descValid && priceValid && dirty;

  function submit() {
    if (!valid || busy) return;
    const patch: { title?: string; description?: string; askingPriceUsdc?: number } = {};
    if (titleChanged) patch.title = title.trim();
    if (descChanged) patch.description = description.trim();
    if (priceChanged && typeof price === 'number') patch.askingPriceUsdc = price;
    onSave(patch);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(14,14,14,0.55)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden"
        style={{
          background: 'var(--lp-card)',
          color: 'var(--lp-dark)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 pt-6 pb-3">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:EDIT OFFER:]
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight">
            Fix the details
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
        </div>
        <div className="px-6 pb-6 space-y-4">
          <p className="text-[13px] text-[var(--lp-text-sub)] leading-relaxed">
            Edits apply right away. Active match scans use the new copy on their next pass.
          </p>

          <label className="block space-y-1.5">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:TITLE:]
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              className="form-input"
              maxLength={120}
            />
            <span className="mono text-[10px] text-[var(--lp-text-muted)]">
              {title.length}/120
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:DESCRIPTION:]
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              rows={4}
              className="form-input form-textarea"
              maxLength={500}
            />
            <span className="mono text-[10px] text-[var(--lp-text-muted)]">
              {description.length}/500
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:ASKING PRICE USDC:]
            </span>
            <input
              type="number"
              min={1}
              max={5_000_000}
              step={1}
              value={price === '' ? '' : price}
              onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={busy}
              className="form-input form-input-num"
            />
            {priceChanged && (
              <span className="mono text-[10px] text-[var(--lp-text-sub)]">
                was {initialAskingPriceUsdc} USDC
              </span>
            )}
          </label>

          {error && (
            <p className="mono text-[11px] text-[#b03d3a]">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <CTAPill onClick={submit} disabled={!valid || busy}>
              {busy ? 'Saving...' : 'Save changes'}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              Cancel
            </CTAPill>
          </div>
        </div>
      </div>
    </div>
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
