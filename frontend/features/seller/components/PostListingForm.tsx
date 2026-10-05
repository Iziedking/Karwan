'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { CreationReview } from '@/features/deals/components/CreationReview';
import { TermsBuilder, DEFAULT_TERMS } from '@/features/deals/terms/TermsBuilder';
import { cleanLines, composeTerms, termsIssues, type TermsDraft } from '@/features/deals/terms/composeTerms';
import { TERMS_COPY } from '@/features/deals/terms/termsCopy';

const READY_CHIPS = [1, 3, 7, 14] as const;
const MAX_READY_DAYS = 180;
const OPEN_CHIPS = [7, 30, 90] as const;
const MAX_FLOOR_DROP_PCT = 50;

const chip =
  'inline-flex min-h-11 items-center rounded-full border px-3.5 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]';
const chipOn = 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]';
const chipOff = 'border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]';

const fill = (template: string, n: number | string) => template.replace('{n}', String(n));

export function PostListingForm() {
  const pl = useTranslations().postListing;
  const t = useTranslations();
  const rs = t.dealCreation.requestSteps;
  const f = pl.flow;
  const { locale } = useLocale();
  const router = useRouter();
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
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [reviewing, setReviewing] = useState(false);
  const [title, setTitle] = useState(search.get('title') ?? '');
  const [description, setDescription] = useState(search.get('description') ?? '');
  const [price, setPrice] = useState<number | ''>(initialPrice ?? '');
  const [floorPrice, setFloorPrice] = useState<number | ''>(
    initialPrice != null && initialTolerance != null && initialTolerance > 0
      ? Math.round(initialPrice * (1 - initialTolerance / 100) * 100) / 100
      : '',
  );
  const [readyInDays, setReadyInDays] = useState<number | ''>('');
  const [customReady, setCustomReady] = useState(false);
  const [openDays, setOpenDays] = useState<number>(30);
  const [terms, setTerms] = useState<TermsDraft>(DEFAULT_TERMS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Listing[]>([]);
  const { dismissed, dismiss } = useDismissed('seller-listings');
  const [watchingForListingId, setWatchingForListingId] = useState<string | null>(null);
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
      router.push(`/jobs/${e.jobId}`);
      return;
    }
  }, [events, watchingForListingId, router]);

  useEffect(() => {
    if (!address) return;
    if (events.some((e) => e.type === 'listing.matched' || e.type === 'listing.posted')) {
      api.listingsForSeller(address).then((r) => setRecent(r.listings)).catch(() => {});
    }
  }, [events, address]);

  useEffect(() => {
    if (!address) return;
    api.listingsForSeller(address).then((r) => setRecent(r.listings)).catch(() => {});
  }, [address]);

  const priceValue = typeof price === 'number' && price > 0 ? price : null;
  const floorDropPct =
    priceValue && typeof floorPrice === 'number' && floorPrice > 0 && floorPrice <= priceValue
      ? Math.round(((priceValue - floorPrice) / priceValue) * 10000) / 100
      : null;
  const floorInvalid =
    floorPrice !== '' && (!priceValue || floorPrice <= 0 || floorPrice > priceValue || (floorDropPct ?? 0) > MAX_FLOOR_DROP_PCT);
  const readyValid = typeof readyInDays === 'number' && readyInDays >= 1 && readyInDays <= MAX_READY_DAYS;
  const agreementText = composeTerms(terms, { priceUsdc: priceValue, dueLabel: null }, TERMS_COPY[locale].text);
  const stepReady =
    step === 0
      ? title.trim().length >= 3 && description.trim().length >= 5
      : step === 1
        ? !!priceValue && !floorInvalid && readyValid
        : termsIssues(terms).length === 0;

  function goForward() {
    if (!stepReady) return;
    if (step < 2) setStep((step + 1) as 1 | 2);
    else setReviewing(true);
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
      const r = await api.postListing({
        sellerUser: address,
        title: title.trim(),
        description: description.trim(),
        askingPriceUsdc: priceValue,
        negotiationMaxDecreasePct: floorDropPct ?? undefined,
        ttlDays: openDays,
        readyInDays: readyInDays as number,
        terms: agreementText,
        termsDraft: {
          conditions: cleanLines(terms.conditions),
          proof: 'link',
          parts: terms.parts,
          reviewWindowDays: terms.reviewWindowDays,
        },
      });
      setRecent((prev) => [r.listing, ...prev]);
      setWatchingForListingId(r.listing.id);
      recordAction('post-listing');
      setTitle('');
      setDescription('');
      setTerms(DEFAULT_TERMS);
      setReviewing(false);
      setStep(0);
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isConnected) {
    return <p className="text-[14px] text-[var(--lp-workspace-muted)]">{pl.notConnected}</p>;
  }

  const stepLabels = [rs.describe, rs.price, rs.payment];

  return (
    <div className="space-y-7">
      <PageTour id={SELLER_TOUR_ID} steps={SELLER_STEPS} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reviewing) void publish();
          else goForward();
        }}
        className="space-y-7"
      >
        <fieldset hidden={reviewing} disabled={submitting} className="min-w-0 space-y-6">
          <div className="flex items-center gap-3" aria-live="polite">
            <span aria-hidden className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'block h-2 rounded-full transition-all duration-[var(--dur-small)]',
                    i === step ? 'w-6 bg-[var(--lp-dark)]' : i < step ? 'w-2 bg-[var(--lp-accent)]' : 'w-2 bg-[var(--lp-border-light)]',
                  )}
                />
              ))}
            </span>
            <span className="text-[14px] font-semibold text-[var(--lp-text-sub)]">
              {fill(rs.stepOf, step + 1)} · {stepLabels[step]}
            </span>
          </div>

          <div hidden={step !== 0} className="space-y-6" data-guide="seller-listing">
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
                rows={4}
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

          <div hidden={step !== 1} className="space-y-6">
            <div role="group" aria-label={f.charge}>
              <p className="mb-2 text-[14px] font-semibold text-[var(--lp-dark)]">{f.charge}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <span className="rounded-[16px] border border-[var(--lp-accent)] bg-[var(--lp-card)] px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--lp-accent)]">
                  <span className="flex items-center justify-between gap-2 text-[15px] font-semibold text-[var(--lp-dark)]">
                    {f.fixed}
                    <span className="grid size-5 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--lp-band-dark)]">
                      <Icon name="check" size={16} />
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[14px] text-[var(--lp-text-sub)] font-medium">{f.fixedHint}</span>
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
                    className="group cursor-not-allowed rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3.5 py-3 opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
                  >
                    <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{option.label}</span>
                    <span aria-hidden className="mt-0.5 block text-[14px] text-[var(--lp-text-sub)] group-hover:hidden group-focus-visible:hidden font-medium">
                      {option.hint}
                    </span>
                    <span aria-hidden className="mt-0.5 hidden text-[14px] font-semibold text-[var(--lp-dark)] group-hover:block group-focus-visible:block">
                      {f.soon}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={f.price} unit="USDC" hint={pl.sectionPricing.askingHint} dataGuide="seller-price">
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="form-input form-input-num"
                />
              </Field>
              <Field label={f.floor} unit="USDC" hint={f.floorHint} dataGuide="seller-floor">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={floorPrice}
                  onChange={(e) => setFloorPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={priceValue ? String(priceValue) : '0'}
                  aria-invalid={floorInvalid || undefined}
                  className="form-input form-input-num"
                />
                {floorInvalid ? (
                  <span className="block text-[14px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))]">{f.floorTooLow}</span>
                ) : null}
              </Field>
            </div>

            <div>
              <p className="mb-2 text-[14px] font-semibold text-[var(--lp-dark)]">{f.readyIn}</p>
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
                  <label className="inline-flex items-center gap-2 text-[14px] text-[var(--lp-text-sub)] font-medium">
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
              <p className="mt-1.5 text-[14px] text-[var(--lp-text-sub)] font-medium">{f.readyInHint}</p>
            </div>

            <div data-guide="seller-window">
              <p className="mb-2 text-[14px] font-semibold text-[var(--lp-dark)]">{f.openFor}</p>
              <div className="flex flex-wrap gap-2">
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
            </div>
          </div>

          <div hidden={step !== 2} className="space-y-6">
            <TermsBuilder value={terms} onChange={setTerms} priceUsdc={priceValue} dueLabel={null} disabled={submitting} />
          </div>
        </fieldset>

        {reviewing ? (
          <CreationReview
            busy={submitting}
            onEdit={() => setReviewing(false)}
            rows={[
              { label: pl.sectionWork.titleLabel, value: title.trim() },
              { label: pl.sectionWork.descriptionLabel, value: description.trim() },
              { label: f.charge, value: f.fixed },
              { label: f.price, value: `${priceValue} USDC` },
              ...(floorDropPct ? [{ label: f.floor, value: `${floorPrice} USDC` }] : []),
              { label: f.readyIn, value: fill(f.readyInRow, readyInDays) },
              { label: f.openFor, value: fill(f.openForRow, openDays) },
              { label: t.dealCreation.payment, value: terms.parts.map((part) => `${part.pct}%`).join(' / ') },
              ...(cleanLines(terms.conditions).length
                ? [{ label: TERMS_COPY[locale].conditions, value: cleanLines(terms.conditions).map((line) => `• ${line}`).join('\n') }]
                : []),
              { label: TERMS_COPY[locale].agreement, value: agreementText },
            ]}
          >
            <p>{f.next}</p>
          </CreationReview>
        ) : null}

        {/* An offer that reads like a request is named before it posts. A
            second press publishes it as written. */}
        {reviewing && intentCheck.wrong && intentWarned && (
          <div className="rounded-[12px] border border-[color-mix(in_srgb,var(--lp-dark)_20%,var(--neg))] px-4 py-3">
            <p className="text-[14px] font-semibold text-[var(--lp-dark)]">{pl.intentWarning.eyebrow}</p>
            <p className="mt-1 text-[14px] leading-snug text-[var(--lp-dark)]">
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

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {!reviewing && step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((step - 1) as 0 | 1)}
              disabled={submitting}
              className="inline-flex min-h-12 items-center rounded-full px-4 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)]"
            >
              {rs.back}
            </button>
          ) : null}
          {reviewing ? (
            <button
              type="submit"
              data-guide="seller-submit"
              disabled={submitting}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--lp-accent)] px-6 text-[15px] font-semibold text-[var(--lp-band-dark)] transition-colors hover:bg-[var(--lp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
            >
              {submitting ? f.publishing : f.publish}
              {!submitting && <Icon name="send" size={16} directional />}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!stepReady || submitting}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-[var(--lp-accent)] px-6 text-[15px] font-semibold text-[var(--lp-band-dark)] transition-colors hover:bg-[var(--lp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
            >
              {step < 2 ? rs.continue : t.dealCreation.review}
            </button>
          )}
        </div>

        {watchingForListingId && (
          <p className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--lp-accent-on-light)]">
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
            {pl.watchingScanning}
          </p>
        )}
        {error && (
          <div className="space-y-1.5">
            <p role="alert" className="text-[14px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))]">
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
                className="text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50"
              >
                {activating ? pl.errors.activating : pl.errors.activateCta}
              </button>
            )}
          </div>
        )}
      </form>

      {recent.length > 0 && (() => {
        const now = Date.now();
        const visible = recent.filter((l) => !dismissed.has(l.id));
        if (visible.length === 0) {
          return (
            <div className="pt-6 border-t border-[var(--lp-workspace-border)]">
              <p className="mono text-[13px] uppercase tracking-[0.18em] text-[var(--lp-workspace-muted)] mb-3">
                {pl.yourOffers.eyebrow}
              </p>
              <p className="text-[14px] text-[var(--lp-workspace-muted)]">
                {pl.yourOffers.allDismissed}
              </p>
            </div>
          );
        }
        return (
          <div className="pt-6 border-t border-[var(--lp-workspace-border)]">
            <p className="mono text-[13px] uppercase tracking-[0.18em] text-[var(--lp-workspace-muted)] mb-4">
              {pl.yourOffers.eyebrow}
            </p>
            <ul className="divide-y divide-[var(--lp-workspace-border)]">
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
                const arrow = isMatched ? '↗' : '→';
                return (
                  <li
                    key={l.id}
                    onClick={() => router.push(`/listings/${l.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/listings/${l.id}`);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={pl.openAriaTemplate.replace('{title}', l.title)}
                    className="group cursor-pointer py-3 flex items-center justify-between gap-3 hover:bg-[var(--lp-workspace-soft)] -mx-2 px-2 transition-colors rounded-md focus:bg-[var(--lp-workspace-soft)] focus:outline-none"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold tracking-tight truncate text-[var(--lp-workspace-ink)]">
                        {l.title}
                      </p>
                      <p className="text-[14px] text-[var(--lp-workspace-muted)] truncate">{l.description}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-sans text-[16px] font-extrabold tabular-nums tracking-[-0.01em] text-[var(--lp-workspace-ink)]">
                        {l.askingPriceUsdc}
                        <span className="ms-1 mono text-[13px] uppercase tracking-[0.12em] text-[var(--lp-workspace-muted)]">
                          USDC
                        </span>
                      </span>
                      {isTerminal && (
                        <button
                          type="button"
                          title={pl.dismissTitle}
                          aria-label={pl.dismissAriaTemplate.replace('{status}', label.toLowerCase())}
                          onClick={(e) => {
                            e.stopPropagation();
                            dismiss(l.id);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full mono text-[14px] text-[var(--lp-workspace-muted)] hover:text-[var(--lp-workspace-ink)] hover:bg-[var(--lp-workspace-soft)] transition-colors"
                        >
                          ×
                        </button>
                      )}
                      <span
                        className="mono text-[13px] uppercase tracking-[0.12em] font-semibold"
                        style={{
                          color: isCancelled || isExpired ? 'var(--lp-workspace-muted)' : 'var(--lp-accent-on-light)',
                        }}
                      >
                        {label}
                        <span
                          aria-hidden
                          className="ms-1 inline-block transition-transform duration-200 group-hover:translate-x-0.5"
                        >
                          {arrow}
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
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
        <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--lp-dark)]">
          {label}
          {hint && <Hint>{hint}</Hint>}
        </span>
        {unit && <span className="text-[14px] text-[var(--lp-text-sub)] font-medium">{unit}</span>}
      </span>
      {children}
    </label>
  );
}
