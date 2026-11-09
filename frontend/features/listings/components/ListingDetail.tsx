'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type Listing, type ListingStatus } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { formatUsdc, relativeTime } from '@/shared/utils/format';
import { CTAPill } from '@/shared/components/Bands';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { FactRows } from '@/shared/components/FactRows';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { TERMS_COPY } from '@/features/deals/terms/termsCopy';
import { OfferGallery } from './OfferGallery';
import { Icon } from '@/shared/components/Icon';
import { ratingText } from '@/features/ratings/ratingText';
import { CATEGORY_IDS, type CategoryId } from '@/features/market/marketModel';
import { CategoryChips } from '@/features/market/components/CategoryChips';
import { samplePhoto } from '@/features/market/listingFacts';
import { countryName, howItWorks, howYouPay, whatYouGet } from '../listingPage';
import { ReportOffer } from './ReportOffer';
import type { WithPhotos } from '../photos';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { MoneyInput } from '@/features/money/components/MoneyInput';
import { Price } from '@/features/money/components/Price';

type FetchState = 'loading' | 'ok' | 'error';

export function ListingDetail({ listingId }: { listingId: string }) {
  const translations = useTranslations();
  const money = useMoneyText({ compact: true });
  const ld = translations.listingDetail;
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
    category?: CategoryId;
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
        <div className="h-4 w-24 rounded-full bg-[var(--raised)]" />
        <div className="mt-5 h-9 w-3/4 rounded-[12px] bg-[var(--raised)]" />
        <div className="mt-3 h-4 w-1/2 rounded-full bg-[var(--raised)]" />
        <div className="mt-8 h-24 rounded-[18px] bg-[var(--raised)]" />
      </main>
    );
  }

  if (fetchState === 'error' || !listing) {
    return (
      <main className="product-surface mx-auto w-full max-w-[760px] px-4 pb-16 pt-10 sm:px-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{ld.notFound.headline}</h1>
        <p className="mt-2 text-[15px] text-[var(--ink-secondary)]">{ld.notFound.body}</p>
        <Link href="/market" className={`mt-6 ${buttonClasses({ variant: 'primary', size: 'lg' })}`}>
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
    ? 'bg-[var(--color-critical-soft)] text-[var(--ink)]'
    : matched
      ? 'bg-[var(--raised)] text-[var(--ink)]'
      : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-secondary)]';
  const sellerProfile = sellerQuery.data?.profile;
  const sellerName = viewerIsOwner
    ? ld.pitch.sellerSelfLabel
    : sellerProfile?.displayName?.trim() || (sellerProfile?.handle ? `@${sellerProfile.handle}` : ld.pitch.sellerLabel);
  // Order opens the review of this offer (view 44); signed out, it signs in first.
  const buyerOfferHref = `/order/${encodeURIComponent(listing.id)}`;
  const primaryClass = buttonClasses({ variant: 'primary', size: 'lg' });
  const quietClass =
    'inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--ink)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';

  const action = isCancelled ? (
    <p className="text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{ld.state.cancelledBody}</p>
  ) : isExpired ? (
    <>
      <p className="text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">
        {listing.matchedJobId ? ld.state.expiredMatchedBody : ld.state.expiredUnmatchedBody}
      </p>
      {listing.matchedJobId ? <Link href={`/jobs/${listing.matchedJobId}`} className={`mt-4 ${primaryClass}`}>{ld.state.openMatchedCta}</Link> : null}
    </>
  ) : matched ? (
    <>
      <p className="text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{ld.state.matchedBody}</p>
      <Link href={`/jobs/${listing.matchedJobId}`} className={`mt-4 ${primaryClass}`}>{ld.state.openMatchedCta}</Link>
    </>
  ) : viewerIsOwner ? (
    <>
      <p className="text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{ld.state.scanningBody}</p>
      {!confirmCancel ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-6">
          <button type="button" onClick={() => setShowEdit(true)} className={quietClass}>{ld.state.editCta}</button>
          <button type="button" onClick={() => setConfirmCancel(true)} className={`${quietClass} text-[var(--ink-secondary)]`}>{ld.state.cancelCta}</button>
        </div>
      ) : (
        <div className="mt-4 rounded-[14px] bg-[var(--color-critical-soft)] p-4">
          <p className="text-[14px] text-[var(--ink)]">{ld.state.confirmCancelBody}</p>
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
          {cancelError ? <p role="alert" className="mt-2 text-[14px] text-[var(--ink)]">{cancelError}</p> : null}
        </div>
      )}
    </>
  ) : null;

  const shop = translations.marketShop;
  const card = listing.seller ?? null;
  const shownName = viewerIsOwner
    ? ld.pitch.sellerSelfLabel
    : card?.name || (card?.tag ? `@${card.tag}` : sellerName);
  const stepName = viewerIsOwner ? ld.pitch.sellerSelfLabel : card?.name?.split(/\s+/)[0] || (card?.tag ? `@${card.tag}` : shop.listing.seller);
  const category = (CATEGORY_IDS as readonly string[]).includes(listing.category ?? '') ? (listing.category as CategoryId) : null;
  const photos = (listing as Listing & WithPhotos).photoUrls ?? [];
  const gets = whatYouGet(listing);
  const steps = howItWorks(stepName, listing.deliveryKind, shop);
  const rating = ratingText(card?.rating ?? { kind: 'new', count: 0 }, translations.ratings, locale);
  const country = countryName(card?.country, locale);
  const recordHref = card?.tag ? `/r/${encodeURIComponent(card.tag)}` : `/credit-passport/${listing.sellerUser}`;
  const messageHref = sellerProfile?.handle
    ? `/messages/${encodeURIComponent(sellerProfile.handle)}?about=listing:${encodeURIComponent(listing.id)}`
    : null;
  const buyerView = isOpen && !viewerIsOwner;
  const orderLabel = money.fill(shop.listing.order, { amount: listing.askingPriceUsdc });
  const facts = [
    listing.readyInDays
      ? { label: shop.listing.delivery, value: listing.readyInDays === 1 ? shop.listing.inOneDay : shop.listing.inDays.replace('{n}', String(listing.readyInDays)) }
      : null,
    { label: shop.listing.howYouPay, value: howYouPay(listing, shop) },
  ].filter((fact): fact is { label: string; value: string } => !!fact);
  const factList = <FactRows facts={facts} />;
  // The careful escrow words chosen on 1 Nov stand; view 48 only moves them beside the buttons.
  const protectedNote = (
    <p data-listing-safety className="flex items-start gap-2 text-[13px] leading-[1.4] text-[var(--ink-secondary)]">
      <Icon name="shield-check" size={16} className="mt-px shrink-0 text-[var(--ink)]" />
      <span>{shop.listing.protectedNote}</span>
    </p>
  );
  const messageLabel = shop.listing.message.replace('{name}', stepName);
  const orderButtons = (
    <div className="grid gap-2">
      <Link href={buyerOfferHref} className={buttonClasses({ variant: 'primary', size: 'lg' })}>{orderLabel}</Link>
      {messageHref ? <Link href={messageHref} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{messageLabel}</Link> : null}
    </div>
  );
  const priceLine = (size: 'page' | 'panel') => (
    <Price usdc={Number(listing.askingPriceUsdc)} agreed={listing.askingLocal} compact size="hero" figureClassName={`${size === 'panel' ? 'text-[34px]' : 'text-[22px]'} font-semibold leading-none tracking-[-0.02em] text-[var(--ink)]`} />
  );

  return (
    <main className="product-surface mx-auto w-full max-w-[1120px] px-4 pb-16 pt-4 sm:px-6">
      {/* View 48: photos, what it is and the price first; on a wide screen the price, facts and buttons sit beside them, the seller under. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] lg:gap-x-10">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {photos.length ? (
            <OfferGallery urls={photos} title={listing.title} />
          ) : (
            <div className="relative mt-2 overflow-hidden rounded-[var(--radius-card)] bg-[var(--raised)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={samplePhoto(category)} alt="" className="aspect-[4/3] w-full object-cover lg:aspect-[16/9]" />
              {!listing.example ? (
                <span className="absolute bottom-3 end-3 rounded-full bg-[color-mix(in_srgb,var(--canvas)_80%,transparent)] px-2.5 py-1 text-[13px] font-medium text-[var(--ink)]">
                  {shop.samplePhoto}
                </span>
              ) : null}
            </div>
          )}

          {!isOpen ? (
            <span className={`mt-5 inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold ${pill}`}>{statusLabel}</span>
          ) : null}
          <h1 dir="auto" className="mt-5 text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--ink)] lg:mt-6 lg:text-[22px]">
            {listing.title}
          </h1>
          <div className="mt-2 lg:hidden">{priceLine('page')}</div>
        </div>

        <div className="mt-5 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-2">
          {buyerView ? (
            <aside data-order-panel className={`${CARD_CLASS} hidden space-y-5 p-6 lg:block`}>
              {priceLine('panel')}
              {factList}
              {orderButtons}
              {protectedNote}
            </aside>
          ) : null}
          <Link
            href={recordHref}
            data-listing-seller
            className={`${CARD_CLASS} flex items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]`}
          >
            <PersonAvatar address={listing.sellerUser} name={shownName} size={44} />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1 text-[15px] font-semibold text-[var(--ink)]">
                <span dir="auto" className="truncate">{shownName}</span>
                {card?.verified ? (
                  <span role="img" aria-label={shop.verified} className="shrink-0 text-[var(--ink)]"><Icon name="badge-check" size={16} /></span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-[var(--ink-secondary)]">{[rating, country].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="shrink-0 text-[14px] font-semibold text-[var(--ink)]">{shop.listing.record}</span>
          </Link>
          <div className={`${CARD_CLASS} px-5 py-1 lg:hidden`}>{factList}</div>
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <p dir="auto" className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--ink-secondary)] lg:mt-2">{listing.description}</p>

          {showFloor ? (
            <div className="mt-6">
              <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{ld.pitch.floorLabelTemplate.replace('{n}', String(listing.negotiationMaxDecreasePct ?? 0))}</p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums text-[var(--ink)]">{money.text(floor!)}</p>
              <p className="mt-1 text-[14px] text-[var(--ink-muted)]">{ld.pitch.floorNote}</p>
            </div>
          ) : null}

          {gets.length ? (
            <section aria-labelledby="listing-gets" className="mt-8">
              <h2 id="listing-gets" className="text-[17px] font-semibold text-[var(--ink)]">{shop.listing.whatYouGet}</h2>
              <ul className="mt-3 space-y-2">
                {gets.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[15px] text-[var(--ink)]">
                    <Icon name="check" size={20} className="mt-0.5 shrink-0 text-[var(--ink)]" />
                    <span dir="auto">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {buyerView ? (
            <section aria-labelledby="listing-how" className="mt-8">
              <h2 id="listing-how" className="text-[17px] font-semibold text-[var(--ink)]">{shop.listing.howItWorks}</h2>
              <ol className="mt-3 space-y-3">
                {steps.map((step, i) => (
                  <li key={step} className="flex gap-3 text-[15px] text-[var(--ink)]">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--raised)] text-[14px] font-semibold tabular-nums">{i + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <section className={`${CARD_CLASS} mt-6 p-5`}>{action}</section>
          )}

          <p className="mt-6 text-[13px] text-[var(--ink-muted)]">
            {ld.hero.postedTemplate.replace('{time}', relativeTime(listing.postedAt, locale))}
            {isOpen && listing.expiresAt ? ` · ${ld.state.windowClosesTemplate.replace('{time}', relativeTime(listing.expiresAt, locale))}` : null}
          </p>

          {listing.terms ? (
            <details className="group mt-6 border-t border-[var(--line)]">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[14px] font-medium text-[var(--ink-secondary)] [&::-webkit-details-marker]:hidden">
                {TERMS_COPY[locale].agreement}
                <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <p dir="auto" className="whitespace-pre-wrap pb-4 text-[14px] font-medium leading-6 text-[var(--ink-secondary)]">{listing.terms}</p>
            </details>
          ) : null}

          {address && !viewerIsOwner ? <ReportOffer listingId={listing.id} hasPhotos={photos.length > 0} /> : null}
        </div>
      </div>

      {buyerView ? (
        <div
          data-order-bar
          className={`sticky z-20 -mx-4 mt-6 space-y-3 border-t border-[var(--line)] bg-[var(--canvas)] px-4 py-3 sm:-mx-6 sm:px-6 lg:hidden ${isConnected ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'}`}
        >
          {protectedNote}
          {orderButtons}
        </div>
      ) : null}

      {showEdit ? (
        <EditListingModal
          initialTitle={listing.title}
          initialDescription={listing.description}
          initialAskingPriceUsdc={listing.askingPriceUsdc}
          initialFloorPct={listing.negotiationMaxDecreasePct ?? 0}
          initialTtlDays={Math.max(1, Math.round((listing.expiresAt - Date.now()) / 86_400_000))}
          initialCategory={category}
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

/// Drawn on the page body: inside the page it sat under the phone's bottom bar,
/// which covered Save changes.
function EditListingModal(props: Parameters<typeof EditListingSheet>[0]) {
  return createPortal(<EditListingSheet {...props} />, document.body);
}

function EditListingSheet({
  initialTitle,
  initialDescription,
  initialAskingPriceUsdc,
  initialFloorPct,
  initialTtlDays,
  initialCategory,
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
  initialCategory: CategoryId | null;
  busy: boolean;
  error: string | null;
  onSave: (patch: {
    title?: string;
    description?: string;
    askingPriceUsdc?: number;
    negotiationMaxDecreasePct?: number;
    ttlDays?: number;
    category?: CategoryId;
  }) => void;
  onClose: () => void;
}) {
  const all = useTranslations();
  const em = all.listingDetail.editModal;
  const money = useMoneyText({ compact: true });
  const [category, setCategory] = useState<CategoryId | null>(initialCategory);
  const categoryChanged = !!category && category !== initialCategory;
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
  const dirty = titleChanged || descChanged || priceChanged || floorChanged || ttlChanged || categoryChanged;
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
      category?: CategoryId;
    } = {};
    if (categoryChanged && category) patch.category = category;
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
          background: 'var(--surface)',
          color: 'var(--ink)',
          border: '1px solid var(--line)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 pt-6 pb-3">
          <span className="text-[14px] font-semibold text-[var(--ink)]">
            {em.tag}
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight">
            {em.title}
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
        </div>
        <div className="px-6 pb-6 space-y-4">
          <p className="text-[14px] text-[var(--ink-secondary)] leading-relaxed font-medium">
            {em.body}
          </p>

          <label className="block space-y-1.5">
            <span className="text-[14px] font-semibold text-[var(--ink)]">
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
            <span className="mono text-[13px] text-[var(--ink-muted)]">
              {title.length}/120
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[14px] font-semibold text-[var(--ink)]">
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
            <span className="mono text-[13px] text-[var(--ink-muted)]">
              {description.length}/500
            </span>
          </label>

          <div className="space-y-1.5">
            <span className="text-[14px] font-semibold text-[var(--ink)]">
              {all.marketShop.categoriesLabel}
            </span>
            <CategoryChips withAll={false} value={category} onChange={(next) => next !== 'all' && setCategory(next)} />
          </div>

          <label className="block space-y-1.5">
            <span className="text-[14px] font-semibold text-[var(--ink)]">
              {em.askingPriceEyebrow}
            </span>
            <MoneyInput
              value={price === '' ? null : price}
              onChange={(usdc) => setPrice(usdc === null ? '' : usdc)}
              disabled={busy}
              ariaLabel={em.askingPriceEyebrow}
            />
            {priceChanged && (
              <span className="mono text-[13px] text-[var(--ink-secondary)]">
                {money.fill(em.priceWasTemplate, { n: initialAskingPriceUsdc })}
              </span>
            )}
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold text-[var(--ink)]">
                {em.floorEyebrow}
              </span>
              <span className="font-sans text-[16px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--ink)]">
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
            <p className="text-[14px] font-medium leading-snug text-[var(--ink-secondary)]">
              {money.fill(em.floorFootTemplate, { amount: typeof price === 'number' ? price * (1 - floorPct / 100) : 0 })}
            </p>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[14px] font-semibold text-[var(--ink)]">
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
            <span className="mono text-[13px] text-[var(--ink-muted)] leading-snug">
              {ttlChanged ? em.windowReanchored : em.windowDefault}
            </span>
          </label>

          {error && (
            <p className="mono text-[14px] text-[#b03d3a]">{error}</p>
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
      <span className="text-[14px] text-[var(--ink-secondary)] font-medium">{label}</span>
      <span
        className={`mono tabular-nums ${
          strong
            ? 'text-[18px] font-extrabold text-[var(--ink)]'
            : 'text-[14px] text-[var(--ink)]'
        }`}
      >
        {formatUsdc(value)}
      </span>
    </div>
  );
}
