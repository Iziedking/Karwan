'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type Listing, type ListingStatus } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { formatUsdc, relativeTime } from '@/shared/utils/format';
import { CTAPill } from '@/shared/components/Bands';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { TERMS_COPY } from '@/features/deals/terms/termsCopy';

type FetchState = 'loading' | 'ok' | 'error';

export function ListingDetail({ listingId }: { listingId: string }) {
  const translations = useTranslations();
  const ld = translations.listingDetail;
  const flow = translations.postListing.flow;
  const { locale } = useLocale();
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
  // Who posted it. Same cache as their avatar, so it is one read per person.
  const sellerQuery = useQuery({
    queryKey: qk.personAvatar(listing?.sellerUser ?? ''),
    queryFn: () => api.getProfile(listing!.sellerUser),
    enabled: !!listing?.sellerUser,
    staleTime: 60_000,
  });

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
    negotiationMaxDecreasePct?: number;
    ttlDays?: number;
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
      <main aria-busy="true" className="product-surface mx-auto w-full max-w-[760px] px-4 pb-16 pt-6 sm:px-6">
        <div className="h-4 w-24 rounded-full bg-[var(--lp-light)]" />
        <div className="mt-5 h-9 w-3/4 rounded-[12px] bg-[var(--lp-light)]" />
        <div className="mt-3 h-4 w-1/2 rounded-full bg-[var(--lp-light)]" />
        <div className="mt-8 h-24 rounded-[18px] bg-[var(--lp-light)]" />
      </main>
    );
  }

  if (fetchState === 'error' || !listing) {
    return (
      <main className="product-surface mx-auto w-full max-w-[760px] px-4 pb-16 pt-10 sm:px-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{ld.notFound.headline}</h1>
        <p className="mt-2 text-[15px] text-[var(--lp-text-sub)]">{ld.notFound.body}</p>
        <Link href="/market" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-[var(--action)] px-6 text-[15px] font-semibold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2">
          {translations.nav.market}
        </Link>
      </main>
    );
  }

  const viewerIsOwner = !!address && address.toLowerCase() === listing.sellerUser.toLowerCase();
  const matched = status === 'matched';
  const isCancelled = status === 'cancelled';
  const isExpired = status === 'expired';
  const isOpen = status === 'open';
  // Floor is the seller agent's private steering value. Backend strips it
  // for non-owners; we double-check on the client so a misconfigured payload
  // can't leak it.
  const showFloor = viewerIsOwner && floor != null;
  const statusLabel = isCancelled
    ? ld.hero.statuses.cancelled
    : isExpired
      ? ld.hero.statuses.expired
      : matched
        ? ld.hero.statuses.matched
        : ld.hero.statuses.open;
  const pill = isCancelled
    ? 'bg-[var(--color-critical-soft)] text-[var(--lp-dark)]'
    : matched
      ? 'bg-[var(--color-accent-soft)] text-[var(--lp-dark)]'
      : 'border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-text-sub)]';
  const sellerProfile = sellerQuery.data?.profile;
  const sellerName = viewerIsOwner
    ? ld.pitch.sellerSelfLabel
    : sellerProfile?.displayName?.trim() || (sellerProfile?.handle ? `@${sellerProfile.handle}` : ld.pitch.sellerLabel);
  const sellerTag = !viewerIsOwner && sellerProfile?.handle && sellerProfile.displayName?.trim() ? `@${sellerProfile.handle}` : null;
  // Buyer-side CTA: pre-fill the new-deal form with this seller + asking price
  // so anyone reading an offer can open a direct deal without copy-paste.
  const buyerOfferHref = isConnected
    ? `/buyer?seller=${listing.sellerUser}&amount=${listing.askingPriceUsdc}&terms=${encodeURIComponent(listing.title)}&listing=${encodeURIComponent(listing.id)}`
    : '/buyer';
  const primaryClass =
    'inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--action)] px-6 text-[15px] font-semibold text-[var(--on-action)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2';
  const quietClass =
    'inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';

  const action = isCancelled ? (
    <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{ld.state.cancelledBody}</p>
  ) : isExpired ? (
    <>
      <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
        {listing.matchedJobId ? ld.state.expiredMatchedBody : ld.state.expiredUnmatchedBody}
      </p>
      {listing.matchedJobId ? <Link href={`/jobs/${listing.matchedJobId}`} className={`mt-4 ${primaryClass}`}>{ld.state.openMatchedCta}</Link> : null}
    </>
  ) : matched ? (
    <>
      <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{ld.state.matchedBody}</p>
      <Link href={`/jobs/${listing.matchedJobId}`} className={`mt-4 ${primaryClass}`}>{ld.state.openMatchedCta}</Link>
    </>
  ) : viewerIsOwner ? (
    <>
      <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{ld.state.scanningBody}</p>
      {!confirmCancel ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-6">
          <button type="button" onClick={() => setShowEdit(true)} className={quietClass}>{ld.state.editCta}</button>
          <button type="button" onClick={() => setConfirmCancel(true)} className={`${quietClass} text-[var(--lp-text-sub)]`}>{ld.state.cancelCta}</button>
        </div>
      ) : (
        <div className="mt-4 rounded-[14px] bg-[var(--color-critical-soft)] p-4">
          <p className="text-[14px] text-[var(--lp-dark)]">{ld.state.confirmCancelBody}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="inline-flex min-h-11 items-center rounded-full bg-[var(--color-critical)] px-5 text-[14px] font-semibold text-[var(--color-white)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-critical)] focus-visible:ring-offset-2"
            >
              {cancelling ? ld.state.confirmYesBusy : ld.state.confirmYes}
            </button>
            <button type="button" onClick={() => setConfirmCancel(false)} disabled={cancelling} className={quietClass}>
              {ld.state.confirmNo}
            </button>
          </div>
          {cancelError ? <p role="alert" className="mt-2 text-[13px] text-[var(--lp-dark)]">{cancelError}</p> : null}
        </div>
      )}
    </>
  ) : (
    <>
      <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{ld.state.buyerBody}</p>
      <Link href={buyerOfferHref} className={`mt-4 w-full sm:w-auto ${primaryClass}`}>
        {ld.state.buyerCtaTemplate.replace('{amount}', String(listing.askingPriceUsdc))}
      </Link>
    </>
  );

  return (
    <main className="product-surface mx-auto w-full max-w-[760px] px-4 pb-16 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--lp-text-sub)]">{ld.pitch.sectionTag}</p>
        <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ${pill}`}>
          {isOpen ? <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)] motion-safe:animate-pulse" /> : null}
          {statusLabel}
        </span>
      </div>

      <h1 dir="auto" className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--lp-dark)] sm:text-[32px]">
        {listing.title}
      </h1>
      <p dir="auto" className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{listing.description}</p>

      <Link
        href={`/credit-passport/${listing.sellerUser}`}
        className="mt-5 flex items-center gap-3 rounded-[16px] py-1 pe-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        <PersonAvatar address={listing.sellerUser} name={sellerName} />
        <span className="min-w-0">
          <span className="block text-[12px] text-[var(--lp-text-sub)]">{ld.pitch.sellerEyebrow}</span>
          <span className="block truncate text-[15px] font-semibold text-[var(--lp-dark)]">
            {sellerName}
            {sellerTag ? <span className="ms-1.5 font-normal text-[var(--lp-text-sub)]">{sellerTag}</span> : null}
          </span>
        </span>
      </Link>

      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <dt className="text-[13px] text-[var(--lp-text-sub)]">{ld.pitch.askingLabel}</dt>
          <dd className="mt-0.5 text-[20px] font-semibold tabular-nums text-[var(--lp-dark)]">{formatUsdc(listing.askingPriceUsdc)}</dd>
        </div>
        {listing.readyInDays ? (
          <div>
            <dt className="text-[13px] text-[var(--lp-text-sub)]">{flow.readyIn}</dt>
            <dd className="mt-0.5 text-[20px] font-semibold text-[var(--lp-dark)]">{flow.readyInRow.replace('{n}', String(listing.readyInDays))}</dd>
          </div>
        ) : null}
        {showFloor ? (
          <div>
            <dt className="text-[13px] text-[var(--lp-text-sub)]">{ld.pitch.floorLabelTemplate.replace('{n}', String(listing.negotiationMaxDecreasePct ?? 0))}</dt>
            <dd className="mt-0.5 text-[20px] font-semibold tabular-nums text-[var(--lp-dark)]">{formatUsdc(floor!)}</dd>
          </div>
        ) : null}
      </dl>
      {showFloor ? <p className="mt-2 text-[12px] text-[var(--lp-text-muted)]">{ld.pitch.floorNote}</p> : null}

      <section className="mt-6 rounded-[18px] bg-[var(--lp-card)] p-5">{action}</section>
      <p className="mt-3 text-[12px] text-[var(--lp-text-muted)]">
        {ld.hero.postedTemplate.replace('{time}', relativeTime(listing.postedAt))}
        {isOpen && listing.expiresAt ? ` · ${ld.state.windowClosesTemplate.replace('{time}', relativeTime(listing.expiresAt))}` : null}
      </p>

      {listing.terms ? (
        <details className="group mt-8 border-t border-[var(--lp-border-light)]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[14px] text-[var(--lp-text-sub)] [&::-webkit-details-marker]:hidden">
            {TERMS_COPY[locale].agreement}
            <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <p dir="auto" className="whitespace-pre-wrap pb-4 text-[14px] leading-6 text-[var(--lp-text-sub)]">{listing.terms}</p>
        </details>
      ) : null}

      {showEdit ? (
        <EditListingModal
          initialTitle={listing.title}
          initialDescription={listing.description}
          initialAskingPriceUsdc={listing.askingPriceUsdc}
          initialFloorPct={listing.negotiationMaxDecreasePct ?? 0}
          initialTtlDays={Math.max(1, Math.round((listing.expiresAt - Date.now()) / 86_400_000))}
          busy={editing}
          error={editError}
          onSave={handleEdit}
          onClose={() => {
            setShowEdit(false);
            setEditError(null);
          }}
        />
      ) : null}
    </main>
  );
}

function EditListingModal({
  initialTitle,
  initialDescription,
  initialAskingPriceUsdc,
  initialFloorPct,
  initialTtlDays,
  busy,
  error,
  onSave,
  onClose,
}: {
  initialTitle: string;
  initialDescription: string;
  initialAskingPriceUsdc: number;
  initialFloorPct: number;
  initialTtlDays: number;
  busy: boolean;
  error: string | null;
  onSave: (patch: {
    title?: string;
    description?: string;
    askingPriceUsdc?: number;
    negotiationMaxDecreasePct?: number;
    ttlDays?: number;
  }) => void;
  onClose: () => void;
}) {
  const em = useTranslations().listingDetail.editModal;
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [price, setPrice] = useState<number | ''>(initialAskingPriceUsdc);
  const [floorPct, setFloorPct] = useState(initialFloorPct);
  const [ttlDays, setTtlDays] = useState<number | ''>(initialTtlDays);
  const titleChanged = title.trim() !== initialTitle;
  const descChanged = description.trim() !== initialDescription;
  const priceChanged = typeof price === 'number' && price !== initialAskingPriceUsdc;
  const floorChanged = floorPct !== initialFloorPct;
  const ttlChanged = typeof ttlDays === 'number' && ttlDays !== initialTtlDays;
  const dirty = titleChanged || descChanged || priceChanged || floorChanged || ttlChanged;
  const titleValid = title.trim().length >= 3 && title.trim().length <= 120;
  const descValid = description.trim().length >= 5 && description.trim().length <= 500;
  const priceValid = typeof price === 'number' && price > 0 && price <= 5_000_000;
  const floorValid = floorPct >= 0 && floorPct <= 50;
  const ttlValid = typeof ttlDays === 'number' && ttlDays >= 1 && ttlDays <= 90;
  const valid = titleValid && descValid && priceValid && floorValid && ttlValid && dirty;

  function submit() {
    if (!valid || busy) return;
    const patch: {
      title?: string;
      description?: string;
      askingPriceUsdc?: number;
      negotiationMaxDecreasePct?: number;
      ttlDays?: number;
    } = {};
    if (titleChanged) patch.title = title.trim();
    if (descChanged) patch.description = description.trim();
    if (priceChanged && typeof price === 'number') patch.askingPriceUsdc = price;
    if (floorChanged) patch.negotiationMaxDecreasePct = floorPct;
    if (ttlChanged && typeof ttlDays === 'number') patch.ttlDays = ttlDays;
    onSave(patch);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-stretch sm:justify-end"
      style={{ background: 'rgba(14,14,14,0.55)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="karwan-sheet-enter max-h-[92dvh] w-full overflow-y-auto rounded-t-[22px] sm:h-full sm:max-h-none sm:w-[480px] sm:rounded-none sm:rounded-s-[16px]"
        style={{
          background: 'var(--lp-card)',
          color: 'var(--lp-dark)',
          border: '1px solid var(--lp-border-light)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 pt-6 pb-3">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {em.tag}
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight">
            {em.title}
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
        </div>
        <div className="px-6 pb-6 space-y-4">
          <p className="text-[13px] text-[var(--lp-text-sub)] leading-relaxed">
            {em.body}
          </p>

          <label className="block space-y-1.5">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              {em.titleEyebrow}
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
              {em.descriptionEyebrow}
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
              {em.askingPriceEyebrow}
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
                {em.priceWasTemplate.replace('{n}', String(initialAskingPriceUsdc))}
              </span>
            )}
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                {em.floorEyebrow}
              </span>
              <span className="font-sans text-[16px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
                -{floorPct}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={floorPct}
              onChange={(e) => setFloorPct(Number(e.target.value))}
              disabled={busy}
              className="w-full accent-[var(--lp-accent)]"
              aria-label={em.floorAria}
            />
            <p className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] leading-snug">
              {em.floorFootTemplate.replace(
                '{amount}',
                typeof price === 'number' ? (price * (1 - floorPct / 100)).toFixed(2) : '0.00',
              )}
            </p>
          </div>

          <label className="block space-y-1.5">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              {em.windowDaysEyebrow}
            </span>
            <input
              type="number"
              min={1}
              max={90}
              step={1}
              value={ttlDays === '' ? '' : ttlDays}
              onChange={(e) => setTtlDays(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={busy}
              className="form-input form-input-num"
            />
            <span className="mono text-[10px] text-[var(--lp-text-muted)] leading-snug">
              {ttlChanged ? em.windowReanchored : em.windowDefault}
            </span>
          </label>

          {error && (
            <p className="mono text-[11px] text-[#b03d3a]">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <CTAPill onClick={submit} disabled={!valid || busy}>
              {busy ? em.saving : em.save}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              {em.cancel}
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
