'use client';
import { MoneyInput, type MoneyInputHandle } from '@/features/money/components/MoneyInput';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useActivation } from '@/shared/hooks/useActivation';
import { api, ApiError, type Listing } from '@/core/api';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';
import { Hint } from '@/shared/components/Hint';
import { cn } from '@/shared/utils/cn';
import { looksLikeWrongSide } from '@/shared/utils/intentDetect';
import { useDismissed } from '@/shared/hooks/useDismissed';
import { PageTour } from '@/shared/guide/PageTour';
import { useGuide } from '@/shared/guide/GuideProvider';
import { SELLER_TOUR_ID, SELLER_STEPS } from '@/shared/guide/tours';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';
import Link from 'next/link';
import { CreationReview } from '@/features/deals/components/CreationReview';
import { FoldRow } from '@/features/deals/components/FoldRow';
import { Button, buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { TermsBuilder, TermsBlockerNote, DEFAULT_TERMS } from '@/features/deals/terms/TermsBuilder';
import { stepOneBlocker } from '../offerFlow';
import { BUSINESS_ACCOUNTS_OPEN } from '@/features/account/businessOpen';
import { cleanLines, composeTerms, termsIssues, type TermsDraft } from '@/features/deals/terms/composeTerms';
import { TERMS_COPY } from '@/features/deals/terms/termsCopy';
import { MarketReadsNote } from '@/features/market/MarketReadsNote';
import { OfferPhotosField } from '@/features/listings/components/OfferPhotosField';
import { CategoryChips } from '@/features/market/components/CategoryChips';
import type { CategoryId } from '@/features/market/marketModel';
import { WhoCanSee, visibilityOf, type WhoCanSeeChoice } from '@/features/market/components/WhoCanSee';
import { DealLinkPanel } from '@/features/market/components/DealLinkPanel';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

const READY_CHIPS = [1, 3, 7, 14] as const;
const MAX_READY_DAYS = 180;
const OPEN_CHIPS = [7, 30, 90] as const;
const MAX_FLOOR_DROP_PCT = 50;

const chip =
  'inline-flex min-h-11 items-center rounded-full border px-3.5 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]';
const chipOn = 'border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]';
const chipOff = 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line-strong)]';

const fill = (template: string, n: number | string) => template.replace('{n}', String(n));

export function PostListingForm() {
  const pl = useTranslations().postListing;
  const t = useTranslations();
  const f = pl.flow;
  const money = useMoneyText({ compact: true });
  const offer = t.offerFlow;
  const rf = t.requestFlow;
  const { locale } = useLocale();
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const { activate, activating } = useActivation();
  const { recordAction } = useGuide();
  // ListingComposer sets these after the natural-language extractor lands so
  // the form mounts pre-filled. Bad values fall through to empty defaults.
  const search = useSearchParams();
  const initialPriceRaw = search.get('price');
  const initialPrice =
    initialPriceRaw != null && Number.isFinite(Number(initialPriceRaw)) && Number(initialPriceRaw) > 0
      ? Number(initialPriceRaw)
      : null;
  const initialToleranceRaw = search.get('tolerance');
  const initialTolerance =
    initialToleranceRaw != null && Number.isFinite(Number(initialToleranceRaw)) ? Number(initialToleranceRaw) : null;
  const [reviewing, setReviewing] = useState(false);
  const [title, setTitle] = useState(search.get('title') ?? '');
  const [description, setDescription] = useState(search.get('description') ?? '');
  // Optional: left empty, the market reads a category from the words.
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [who, setWho] = useState<WhoCanSeeChoice>('market');
  const [price, setPrice] = useState<number | ''>(initialPrice ?? '');
  const priceField = useRef<MoneyInputHandle>(null);
  const [floorPrice, setFloorPrice] = useState<number | ''>(
    initialPrice != null && initialTolerance != null && initialTolerance > 0
      ? Math.round(initialPrice * (1 - initialTolerance / 100) * 100) / 100
      : '',
  );
  const [readyInDays, setReadyInDays] = useState<number | ''>('');
  const [customReady, setCustomReady] = useState(false);
  const [openDays, setOpenDays] = useState<number>(30);
  const [terms, setTerms] = useState<TermsDraft>(DEFAULT_TERMS);
  // One screen (view 48, 9b): the less common settings open in place.
  const [inParts, setInParts] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [openForOpen, setOpenForOpen] = useState(false);
  const [floorOpen, setFloorOpen] = useState(floorPrice !== '');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Listing[]>([]);
  const { dismissed, dismiss } = useDismissed('seller-listings');
  const [watchingForListingId, setWatchingForListingId] = useState<string | null>(null);
  // After publishing, the form gives way to the result; a later match is
  // offered as a link instead of moving the page.
  const [published, setPublished] = useState<{ id: string } | null>(null);
  const [matchedJobId, setMatchedJobId] = useState<string | null>(null);
  const watchedListingRef = useRef<string | null>(null);
  // An offer that reads like a request ("Need a backend engineer") is named
  // before posting. Cleared on every text edit so a reworded post passes again.
  const [intentWarned, setIntentWarned] = useState(false);
  const intentCheck = looksLikeWrongSide(title, description, 'offer');

  const events = useLiveEvents(undefined, 50);
  useEffect(() => {
    if (!watchingForListingId) return;
    for (const e of events) {
      if (e.type !== 'listing.matched') continue;
      const payload = e.payload as { listingId?: string } | undefined;
      if (payload?.listingId !== watchingForListingId) continue;
      if (!e.jobId) continue;
      if (watchedListingRef.current === watchingForListingId) return;
      watchedListingRef.current = watchingForListingId;
      setMatchedJobId(e.jobId);
      return;
    }
  }, [events, watchingForListingId]);

  useEffect(() => {
    if (!address) return;
    if (events.some((e) => e.type === 'listing.matched' || e.type === 'listing.posted')) {
      api.listingsForSeller(address).then((r) => setRecent(r.listings ?? [])).catch(() => {});
    }
  }, [events, address]);

  useEffect(() => {
    if (!address) return;
    api.listingsForSeller(address).then((r) => setRecent(r.listings ?? [])).catch(() => {});
  }, [address]);

  const priceValue = typeof price === 'number' && price > 0 ? price : null;
  const floorDropPct =
    priceValue && typeof floorPrice === 'number' && floorPrice > 0 && floorPrice <= priceValue
      ? Math.round(((priceValue - floorPrice) / priceValue) * 10000) / 100
      : null;
  const floorInvalid =
    floorPrice !== '' && (!priceValue || floorPrice <= 0 || floorPrice > priceValue || (floorDropPct ?? 0) > MAX_FLOOR_DROP_PCT);
  const readyValid = typeof readyInDays === 'number' && readyInDays >= 1 && readyInDays <= MAX_READY_DAYS;
  // One payment unless Pay in parts is opened; its milestone is the title.
  const dealTerms: TermsDraft = inParts ? terms : { ...terms, parts: [{ pct: 100, what: title.trim().slice(0, 240) }] };
  const agreementText = composeTerms(dealTerms, { priceUsdc: priceValue, dueLabel: null }, TERMS_COPY[locale].text);
  const wordsMissing = stepOneBlocker(title, description, offer);
  const ready = !wordsMissing && !!priceValue && !floorInvalid && readyValid && termsIssues(dealTerms).length === 0;

  // View 56: the words become the parts the contract protects. A draft that
  // fails or finds one part keeps one payment, as before.
  async function prepare() {
    if (!inParts) {
      setPreparing(true);
      try {
        const words = [title.trim(), description.trim()].filter(Boolean).join('. ').slice(0, 500);
        const { draft } = await api.dealDraft(words);
        if (draft.parts.length > 1) {
          setTerms((current) => ({ ...current, parts: draft.parts }));
          setInParts(true);
          setDrafted(true);
        }
      } catch {
        /* one payment, as before */
      } finally {
        setPreparing(false);
      }
    }
    setReviewing(true);
  }

  async function publish() {
    if (!address || !priceValue || !readyValid || submitting) return;
    if (intentCheck.wrong && !intentWarned) {
      setIntentWarned(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // The asking price as the seller typed it stays with the offer (view 55).
      const quote = await priceField.current?.quote();
      const r = await api.postListing({
        ...(quote ? { quote: quote.token } : {}),
        ...(photos.length ? { photos } : {}),
        ...(category ? { category } : {}),
        ...visibilityOf(who),
        sellerUser: address,
        title: title.trim(),
        description: description.trim(),
        askingPriceUsdc: quote?.usdc ?? priceValue,
        negotiationMaxDecreasePct: floorDropPct ?? undefined,
        ttlDays: openDays,
        readyInDays: readyInDays as number,
        terms: agreementText,
        termsDraft: {
          conditions: cleanLines(terms.conditions),
          proof: 'link',
          parts: dealTerms.parts,
          reviewWindowDays: terms.reviewWindowDays,
        },
      } as Parameters<typeof api.postListing>[0]);
      setRecent((prev) => [r.listing, ...prev]);
      setWatchingForListingId(r.listing.id);
      setMatchedJobId(null);
      setPublished({ id: r.listing.id });
      recordAction('post-listing');
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? String(err.detail) : offer.tryAgain);
    } finally {
      setSubmitting(false);
    }
  }

  function postAnother() {
    setTitle('');
    setDescription('');
    setPrice('');
    setFloorPrice('');
    setReadyInDays('');
    setCustomReady(false);
    setTerms(DEFAULT_TERMS);
    setPhotos([]);
    setReviewing(false);
    setInParts(false);
    setFloorOpen(false);
    setIntentWarned(false);
    setPublished(null);
    setMatchedJobId(null);
  }

  if (!isConnected) {
    return <p className="text-[14px] text-[var(--lp-workspace-muted)]">{pl.notConnected}</p>;
  }

  return (
    <div className="space-y-7">
      <PageTour id={SELLER_TOUR_ID} steps={SELLER_STEPS} />
      {published ? (
        <section aria-live="polite" className={`${CARD_CLASS} p-5`}>
          <h2 className="text-[20px] font-semibold text-[var(--ink)]">{offer.liveTitle}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{offer.liveBody}</p>
          {matchedJobId ? (
            <p className="mt-4 text-[15px] font-semibold text-[var(--ink)]">
              {offer.matchedTitle}{' '}
              <Link href={`/jobs/${matchedJobId}`} className="underline underline-offset-4">{offer.openDeal}</Link>
            </p>
          ) : null}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link href={`/listings/${published.id}`} className={buttonClasses({ size: 'lg', className: 'w-full sm:w-auto' })}>
              {offer.viewOffer}
            </Link>
            <button type="button" onClick={postAnother} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full sm:w-auto' })}>
              {offer.postAnother}
            </button>
          </div>
        </section>
      ) : (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reviewing) void publish();
          else if (ready) void prepare();
        }}
        className="space-y-6"
      >
        {/* One screen (Figma, Batch 9 · Post an offer): the words, the price
            and time, then the settings most people leave as they are. */}
        <fieldset hidden={reviewing} disabled={submitting} className="min-w-0 space-y-6">
          <div className="space-y-6" data-guide="seller-listing">
            <Field label={pl.sectionWork.titleLabel} hint={pl.sectionWork.titleHint}>
              <input
                type="text"
                value={title}
                maxLength={120}
                placeholder={pl.sectionWork.titlePlaceholder}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setIntentWarned(false);
                }}
                className="form-input"
              />
            </Field>
            <Field label={pl.sectionWork.descriptionLabel} hint={pl.sectionWork.descriptionHint}>
              <textarea
                value={description}
                rows={3}
                maxLength={500}
                placeholder={pl.sectionWork.descriptionPlaceholder}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setIntentWarned(false);
                }}
                className="form-input form-textarea"
              />
            </Field>
          </div>
          {/* Not a Field: a label around buttons would pass every tap to the first chip. */}
          <div className="space-y-2">
            <p className="text-[14px] font-medium text-[var(--ink)]">{t.marketShop.categoriesLabel}</p>
            <CategoryChips withAll={false} value={category} onChange={(next) => setCategory((now) => (now === next || next === 'all' ? null : next))} />
          </div>

          {/* Per unit and per hour open with business accounts; until then a
              fixed price is the only way to charge, so there is no choice. */}
          {BUSINESS_ACCOUNTS_OPEN ? (
          <div role="group" aria-label={f.charge}>
            <p className="mb-2 text-[14px] font-medium text-[var(--ink)]">{f.charge}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <span className="rounded-[var(--radius-input)] border border-[var(--ink)] bg-[var(--surface)] px-3.5 py-3">
                <span className="flex items-center justify-between gap-2 text-[15px] font-semibold text-[var(--ink)]">
                  {f.fixed}
                  <span className="grid size-5 place-items-center rounded-full bg-[var(--ink)] text-[var(--canvas)]">
                    <Icon name="check" size={16} />
                  </span>
                </span>
                <span className="mt-0.5 block text-[14px] font-medium text-[var(--ink-secondary)]">{f.fixedHint}</span>
              </span>
              {[
                { label: f.perUnit, hint: f.perUnitHint },
                { label: f.perHour, hint: f.perHourHint },
              ].map((option) => (
                <span
                  key={option.label}
                  role="button"
                  aria-disabled="true"
                  tabIndex={0}
                  aria-label={`${option.label}, ${f.soon}`}
                  className="group cursor-not-allowed rounded-[var(--radius-input)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                >
                  <span className="block text-[15px] font-semibold text-[var(--ink)]">{option.label}</span>
                  <span aria-hidden className="mt-0.5 block text-[14px] font-medium text-[var(--ink-secondary)] group-hover:hidden group-focus-visible:hidden">
                    {option.hint}
                  </span>
                  <span aria-hidden className="mt-0.5 hidden text-[14px] font-semibold text-[var(--ink)] group-hover:block group-focus-visible:block">
                    {f.soon}
                  </span>
                </span>
              ))}
            </div>
          </div>
          ) : null}

          <Field label={f.price} hint={pl.sectionPricing.askingHint} dataGuide="seller-price">
            <MoneyInput value={price} onChange={(usdc) => setPrice(usdc ?? '')} handle={priceField} />
          </Field>

          <div>
            <p className="mb-2 inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--ink)]">
              {f.readyIn}
              <Hint>{f.readyInHint}</Hint>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {READY_CHIPS.map((days) => {
                const on = !customReady && readyInDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setCustomReady(false);
                      setReadyInDays(days);
                    }}
                    className={cn(chip, on ? chipOn : chipOff)}
                  >
                    {days === 1 ? f.day1 : fill(f.days, days)}
                  </button>
                );
              })}
              <button type="button" aria-pressed={customReady} onClick={() => setCustomReady(true)} className={cn(chip, customReady ? chipOn : chipOff)}>
                {f.other}
              </button>
              {customReady ? (
                <label className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--ink-secondary)]">
                  <span className="block w-20 shrink-0">
                    <input
                      inputMode="numeric"
                      value={readyInDays === '' ? '' : String(readyInDays)}
                      onChange={(e) => {
                        const text = e.target.value.replace(/\D/g, '').slice(0, 3);
                        setReadyInDays(text === '' ? '' : Math.min(MAX_READY_DAYS, Number(text)));
                      }}
                      aria-label={f.otherDays}
                      className="form-input form-input-num h-10 text-end"
                    />
                  </span>
                  {f.otherDays}
                </label>
              ) : null}
            </div>
          </div>

          <div className={cn(CARD_CLASS, 'divide-y divide-[var(--line)] overflow-hidden')}>
            <FoldRow label={f.openFor} fact={fill(f.openForRow, openDays)} open={openForOpen} onToggle={setOpenForOpen}>
              <div className="flex flex-wrap gap-2" data-guide="seller-window">
                {OPEN_CHIPS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    aria-pressed={openDays === days}
                    onClick={() => setOpenDays(days)}
                    className={cn(chip, openDays === days ? chipOn : chipOff)}
                  >
                    {days === 7 ? f.openWeek : days === 30 ? f.open30 : f.open90}
                  </button>
                ))}
              </div>
            </FoldRow>
            <FoldRow
              label={f.floor}
              fact={typeof floorPrice === 'number' && floorPrice > 0 ? money.text(floorPrice) : offer.notSet}
              open={floorOpen}
              onToggle={setFloorOpen}
            >
              <Field label={f.floor} hint={f.floorHint} dataGuide="seller-floor">
                <MoneyInput value={floorPrice} onChange={(usdc) => setFloorPrice(usdc ?? '')} />
              </Field>
            </FoldRow>
            {inParts ? (
            <FoldRow
              label={rf.payInParts}
              fact={inParts ? terms.parts.map((part) => `${part.pct}%`).join(' / ') : offer.onePayment}
              open={inParts}
              onToggle={setInParts}
              payInParts
            >
              <TermsBuilder value={terms} onChange={setTerms} priceUsdc={priceValue} dueLabel={null} disabled={submitting} />
            </FoldRow>
            ) : null}
          </div>
          {floorInvalid ? (
            <p role="alert" className="text-[14px] font-medium text-[var(--ink)]">{f.floorTooLow}</p>
          ) : null}

          {/* Its own block, after the words: the photos are optional and never
              mix with the fields the words check. */}
          <OfferPhotosField value={photos} onChange={setPhotos} title={title.trim()} />
        </fieldset>

        {reviewing ? (
          <CreationReview
            busy={submitting}
            onEdit={() => setReviewing(false)}
            rows={[
              { label: pl.sectionWork.titleLabel, value: title.trim() },
              { label: pl.sectionWork.descriptionLabel, value: description.trim() },
              { label: f.charge, value: f.fixed },
              { label: f.price, value: money.text(priceValue) },
              ...(floorDropPct ? [{ label: f.floor, value: money.text(floorPrice) }] : []),
              { label: f.readyIn, value: fill(f.readyInRow, readyInDays) },
              { label: f.openFor, value: fill(f.openForRow, openDays) },
              { label: t.dealCreation.payment, value: dealTerms.parts.length > 1 ? dealTerms.parts.map((part) => rf.partLine.replace('{pct}', String(part.pct)).replace('{what}', part.what)).join('\n') : '100%' },
              { label: TERMS_COPY[locale].agreement, value: agreementText },
            ]}
          >
            {drafted ? <p data-drafted className="mb-2 text-[var(--ink-secondary)]">{rf.drafted}</p> : null}
            <p>{f.next}</p>
          </CreationReview>
        ) : null}

        {/* An offer that reads like a request is named before it posts. A
            second press publishes it as written. */}
        {reviewing && intentCheck.wrong && intentWarned && (
          <div className="rounded-[var(--radius-input)] border border-[var(--line-strong)] px-4 py-3">
            <p className="text-[14px] font-semibold text-[var(--ink)]">{pl.intentWarning.eyebrow}</p>
            <p className="mt-1 text-[14px] leading-snug text-[var(--ink)]">
              {pl.intentWarning.bodyPart1}
              <span className="font-bold">{pl.intentWarning.bodyEmphNeed}</span>
              {pl.intentWarning.bodyPart2}
              <span className="font-bold">{pl.intentWarning.bodyEmphOffer}</span>
              {pl.intentWarning.bodyPart3}
              <a href="/buyer" className="underline underline-offset-2">
                {pl.intentWarning.postRequestLink}
              </a>
              {pl.intentWarning.bodyPart4}
              <span className="font-bold">{f.publish}</span>
              {pl.intentWarning.bodyPart5}
            </p>
          </div>
        )}

        {/* Asked once, on the form; the review that follows does not ask again. */}
        {reviewing ? null : <WhoCanSee side="offer" value={who} onChange={setWho} />}
        {!reviewing && who === 'link' ? <DealLinkPanel start="link" /> : null}

        <div className="space-y-3 border-t border-[var(--line)] pt-5" hidden={who === 'link'}>
          <Button
            type="submit"
            data-guide="seller-submit"
            size="lg"
            disabled={!reviewing && !ready}
            loading={submitting || preparing}
            loadingLabel={f.publishing}
            className="w-full sm:w-auto"
          >
            {reviewing ? f.publish : t.dealCreation.review}
          </Button>
          {reviewing ? <MarketReadsNote /> : null}
          {!reviewing && wordsMissing ? <p role="status" className="text-[14px] font-medium text-[var(--ink-secondary)]">{wordsMissing}</p> : null}
          {!reviewing && !wordsMissing && inParts && termsIssues(dealTerms).length > 0 ? <TermsBlockerNote terms={dealTerms} /> : null}
        </div>
        {error && (
          <div className="space-y-1.5">
            <p role="alert" className="text-[14px] text-[var(--ink)]">
              {pl.errors.postFailedTemplate.replace('{error}', error)}
            </p>
            {/activate|agent wallet/i.test(error) && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await activate();
                    setError(null);
                  } catch {
                    /* useActivation surfaces its own failure; keep the message */
                  }
                }}
                disabled={activating}
                className="text-[14px] font-semibold text-[var(--ink)] underline underline-offset-2 disabled:opacity-50"
              >
                {activating ? pl.errors.activating : pl.errors.activateCta}
              </button>
            )}
          </div>
        )}
      </form>
      )}

      {recent.length > 0 && (() => {
        const now = Date.now();
        const visible = recent.filter((l) => !dismissed.has(l.id));
        if (visible.length === 0) {
          return (
            <section className="pt-6 border-t border-[var(--lp-workspace-border)]">
              <h2 className="text-[16px] font-semibold text-[var(--lp-workspace-ink)]">{pl.yourOffers.eyebrow}</h2>
              <p className="mt-2 text-[14px] font-medium text-[var(--lp-workspace-muted)]">
                {pl.yourOffers.allDismissed}
              </p>
            </section>
          );
        }
        return (
          <section className="pt-6 border-t border-[var(--lp-workspace-border)]">
            <h2 className="text-[16px] font-semibold text-[var(--lp-workspace-ink)]">{pl.yourOffers.eyebrow}</h2>
            <ul className="mt-2 divide-y divide-[var(--lp-workspace-border)]">
              {visible.slice(0, 5).map((l) => {
                const isCancelled = !!l.cancelledAt;
                const isMatched = !!l.matchedAt && !!l.matchedJobId;
                const isExpired = !isCancelled && !isMatched && (l.expiresAt ?? Infinity) <= now;
                const isTerminal = isCancelled || isMatched || isExpired;
                const label = isCancelled
                  ? pl.offerStatuses.cancelled
                  : isExpired
                    ? pl.offerStatuses.expired
                    : isMatched
                      ? pl.offerStatuses.matched
                      : pl.offerStatuses.open;
                return (
                  <li key={l.id} className="flex items-center gap-1">
                    <Link
                      href={`/listings/${l.id}`}
                      aria-label={pl.openAriaTemplate.replace('{title}', l.title)}
                      className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 rounded-md py-3 hover:bg-[var(--lp-workspace-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
                    >
                      <span className="min-w-0">
                        <span className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-[var(--lp-workspace-ink)]">{l.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[14px] font-medium tabular-nums text-[var(--lp-workspace-muted)]">
                            {money.price(l.askingPriceUsdc, l.askingLocal)}
                          </span>
                          {/* A tinted label, like Request's: the state reads on its own ground. */}
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-[14px] font-semibold',
                              isMatched
                                ? 'bg-[var(--ink)] text-[var(--canvas)]'
                                : isTerminal
                                  ? 'bg-[var(--tint)] text-[var(--ink-secondary)]'
                                  : 'bg-[var(--tint)] text-[var(--ink)]',
                            )}
                          >
                            {label}
                          </span>
                        </span>
                      </span>
                      <Icon name="chevron-right" size={16} directional className="shrink-0 text-[var(--lp-workspace-muted)]" />
                    </Link>
                    {isTerminal && (
                      <button
                        type="button"
                        aria-label={pl.dismissAriaTemplate.replace('{status}', label.toLowerCase())}
                        onClick={() => dismiss(l.id)}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--lp-workspace-muted)] transition-colors hover:bg-[var(--lp-workspace-soft)] hover:text-[var(--lp-workspace-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })()}
    </div>
  );
}

function Field({
  label,
  unit,
  hint,
  children,
  dataGuide,
}: {
  label: string;
  unit?: string;
  hint?: string;
  children: ReactNode;
  dataGuide?: string;
}) {
  return (
    <label className="block space-y-2" data-guide={dataGuide}>
      <span className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--ink)]">
          {label}
          {hint && <Hint>{hint}</Hint>}
        </span>
        {unit && <span className="text-[14px] text-[var(--ink-muted)]">{unit}</span>}
      </span>
      {children}
    </label>
  );
}
