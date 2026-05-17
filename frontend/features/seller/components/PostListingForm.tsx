'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type Listing } from '@/core/api';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';
import { Hint } from '@/shared/components/Hint';
import { cn } from '@/shared/utils/cn';
import { looksLikeWrongSide } from '@/shared/utils/intentDetect';
import { useDismissed } from '@/shared/hooks/useDismissed';

export function PostListingForm() {
  const router = useRouter();
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number | ''>(30);
  const [tolerance, setTolerance] = useState<number | ''>(15);
  // Listing window in days. Backend caps at 90; default 30 lines up with
  // most marketplaces' "your post stays live for a month" convention.
  // Listing window expressed as { value, unit }. Backend takes ttlDays as a
  // fractional number so unit toggling on the form maps cleanly. Default is
  // 30 days; demo flows often pick HR or MIN to drive expiry visibly.
  const [ttlValue, setTtlValue] = useState<number | ''>(30);
  const [ttlUnit, setTtlUnit] = useState<'min' | 'hr' | 'day'>('day');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Listing[]>([]);
  const { dismissed, dismiss } = useDismissed('seller-listings');
  const [watchingForListingId, setWatchingForListingId] = useState<string | null>(null);
  const watchedListingRef = useRef<string | null>(null);
  // When the user clicks Post Listing on a post that reads as a request
  // ("Need a backend engineer"), we surface a confirmation BEFORE hitting
  // the API. Cleared on every text edit so the user has to pass it again
  // after rewording. Two-state: false = warning not raised yet, true = user
  // saw the warning and chose to proceed anyway.
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !title || !description || typeof price !== 'number') return;
    // Gate the post if the wording reads as a request, not an offer. The
    // user can dismiss by clicking again (intentWarned flips true).
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
        askingPriceUsdc: price,
        negotiationMaxDecreasePct: typeof tolerance === 'number' ? tolerance : undefined,
        ttlDays:
          typeof ttlValue === 'number'
            ? ttlValue *
              (ttlUnit === 'min' ? 1 / 1440 : ttlUnit === 'hr' ? 1 / 24 : 1)
            : undefined,
      });
      setRecent((prev) => [r.listing, ...prev]);
      setWatchingForListingId(r.listing.id);
      setTitle('');
      setDescription('');
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isConnected) {
    return (
      <p className="text-[13px] text-white/55">
        Sign in to post a listing. Use the Log in pill in the nav.
      </p>
    );
  }

  const disabled = submitting || !title.trim() || !description.trim() || !price;
  const previewPrice = typeof price === 'number' ? price : 0;
  const previewTol = typeof tolerance === 'number' ? tolerance : 0;
  const floor =
    typeof price === 'number' && typeof tolerance === 'number'
      ? (price * (1 - tolerance / 100)).toFixed(2)
      : null;

  return (
    <div className="space-y-7">
      <form onSubmit={submit} className="space-y-7">
        {/* LISTING PREVIEW. big editorial display */}
        <div
          className="relative overflow-hidden"
          style={{
            background: 'var(--lp-accent)',
            color: 'var(--lp-band-dark)',
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            borderBottomLeftRadius: 18,
            borderBottomRightRadius: 4,
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-30 grid-drift"
            style={{
              backgroundImage:
                'linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(ellipse 70% 80% at 100% 0%, black, transparent 70%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 70% 80% at 100% 0%, black, transparent 70%)',
            }}
          />
          <div className="relative px-6 py-6">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-band-dark)]/65">
              LISTING PREVIEW
            </p>
            <div className="mt-3 flex items-baseline gap-2 flex-wrap">
              <span className="font-sans text-[clamp(2.5rem,6vw,3.75rem)] font-extrabold tabular-nums tracking-[-0.03em] leading-none">
                {previewPrice}
              </span>
              <span className="mono text-[12px] uppercase tracking-[0.12em] text-[var(--lp-band-dark)]/65">
                USDC
              </span>
              <span aria-hidden className="ml-2 mb-1 w-px h-7 bg-[var(--lp-band-dark)]/20" />
              <span className="font-sans text-[clamp(1.5rem,3.4vw,2rem)] font-extrabold tabular-nums tracking-[-0.02em] leading-none">
                −{previewTol}%
              </span>
              <span className="mono text-[12px] uppercase tracking-[0.12em] text-[var(--lp-band-dark)]/65">
                accept
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] mono text-[var(--lp-band-dark)]/65">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  data-instrument-blink
                  className="w-[6px] h-[6px]"
                  style={{
                    background: 'var(--lp-band-dark)',
                    animation: 'instrumentBlink 1.6s ease-in-out infinite',
                  }}
                />
                agent listening
              </span>
              {floor && (
                <>
                  <span aria-hidden className="w-px h-3 bg-[var(--lp-band-dark)]/20" />
                  <span>floor {floor} USDC</span>
                </>
              )}
              <span aria-hidden className="w-px h-3 bg-[var(--lp-band-dark)]/20" />
              <span>matched to buyer briefs</span>
            </div>
          </div>
        </div>

        {/* WHAT YOU OFFER */}
        <FieldSection eyebrow="WHAT YOU OFFER" title="Describe the offer.">
          <FormLabel label="Title" hint="A short headline buyers see first.">
            <input
              type="text"
              value={title}
              maxLength={120}
              disabled={submitting}
              placeholder="e.g. Spanish → Arabic legal translation"
              onChange={(e) => {
                setTitle(e.target.value);
                setIntentWarned(false);
              }}
              className="form-input-dark"
            />
          </FormLabel>
          <FormLabel
            label="Description"
            hint="What you build, examples, turnaround. Your agent uses this to match briefs."
          >
            <textarea
              value={description}
              rows={3}
              maxLength={500}
              disabled={submitting}
              placeholder="Describe your offer in detail. The agent uses this to match buyer briefs."
              onChange={(e) => {
                setDescription(e.target.value);
                setIntentWarned(false);
              }}
              className="form-input-dark form-textarea-dark"
            />
          </FormLabel>
        </FieldSection>

        {/* PRICING */}
        <FieldSection eyebrow="PRICING" title="Set your asking and the floor.">
          <div className="grid grid-cols-3 gap-3">
            <FormLabel
              label="Asking price"
              unit="USDC"
              hint="Your headline price. Your agent bids this on matched briefs."
            >
              <input
                type="number"
                min={1}
                step={1}
                value={price}
                disabled={submitting}
                onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="form-input-dark form-input-num-dark"
              />
            </FormLabel>
            <FormLabel
              label="Accept decrease"
              unit="%"
              hint="How far below asking the agent may accept. 0 = strict at price."
            >
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                value={tolerance}
                disabled={submitting}
                onChange={(e) =>
                  setTolerance(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="form-input-dark form-input-num-dark"
              />
            </FormLabel>
            <FormLabel
              label="Window"
              unit={ttlUnit === 'min' ? 'MIN' : ttlUnit === 'hr' ? 'HRS' : 'DAYS'}
              hint="How long the listing stays live before it auto-expires. Pick a unit for demo timing."
            >
              <div className="flex items-stretch gap-2">
                <input
                  type="number"
                  min={1}
                  max={ttlUnit === 'min' ? 1440 : ttlUnit === 'hr' ? 168 : 90}
                  step={1}
                  value={ttlValue}
                  disabled={submitting}
                  onChange={(e) =>
                    setTtlValue(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="form-input-dark form-input-num-dark flex-1 min-w-0"
                />
                <div
                  role="radiogroup"
                  aria-label="Window unit"
                  className="inline-flex items-stretch p-1 shrink-0"
                  style={{
                    background: 'var(--lp-band-dark)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderTopLeftRadius: 10,
                    borderTopRightRadius: 10,
                    borderBottomLeftRadius: 10,
                    borderBottomRightRadius: 2,
                  }}
                >
                  {(['min', 'hr', 'day'] as const).map((u) => {
                    const active = ttlUnit === u;
                    const label = u === 'min' ? 'MIN' : u === 'hr' ? 'HR' : 'DAY';
                    return (
                      <button
                        key={u}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={submitting}
                        onClick={() => {
                          setTtlUnit(u);
                          // Snap defaults so the value is sensible per unit.
                          if (u === 'min' && (typeof ttlValue !== 'number' || ttlValue > 1440)) setTtlValue(10);
                          if (u === 'hr' && (typeof ttlValue !== 'number' || ttlValue > 168)) setTtlValue(2);
                          if (u === 'day' && (typeof ttlValue !== 'number' || ttlValue > 90)) setTtlValue(30);
                        }}
                        className="mono text-[10px] font-bold uppercase tracking-[0.1em] transition-colors duration-[var(--dur-micro)] px-3"
                        style={{
                          background: active ? 'var(--lp-accent)' : 'transparent',
                          color: active ? 'var(--lp-band-dark)' : 'rgba(255,255,255,0.55)',
                          borderTopLeftRadius: 7,
                          borderTopRightRadius: 7,
                          borderBottomLeftRadius: 7,
                          borderBottomRightRadius: 1,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </FormLabel>
          </div>
        </FieldSection>

        {/* INTENT WARNING. surfaces if the post reads as a buyer request
            rather than a seller offer. User can click submit again to post
            anyway, but the form has named the trap. */}
        {intentCheck.wrong && intentWarned && (
          <div
            className="px-4 py-3"
            style={{
              background: 'rgba(178, 84, 37, 0.10)',
              border: '1px solid rgba(178, 84, 37, 0.35)',
              color: '#e8806b',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            <p className="mono text-[9px] font-bold uppercase tracking-[0.18em] mb-1.5">
              [:WAIT. IS THIS A LISTING OR A BRIEF?:]
            </p>
            <p className="text-[12.5px] leading-snug text-white/85">
              This reads like something you <span className="font-bold">need</span>, not something
              you <span className="font-bold">offer</span>. Listings are for sellers; briefs
              (posted from the buyer desk) are for buyers. If you meant to find a backend engineer,{' '}
              <a
                href="/buyer"
                className="underline underline-offset-2 hover:text-white"
              >
                post a brief instead
              </a>
              . Click <span className="font-bold">Post listing</span> again to publish as-is.
            </p>
          </div>
        )}

        {/* SUBMIT */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/[0.08]">
          <button
            type="submit"
            disabled={disabled}
            className={cn(
              'group inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em]',
              'transition-[transform,box-shadow] duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-dark)]',
              disabled
                ? 'bg-white/[0.05] text-white/35 cursor-not-allowed border border-white/[0.08]'
                : 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_0_rgba(0,0,0,0.45)] hover:shadow-[0_5px_0_rgba(0,0,0,0.45)] active:shadow-[0_1px_0_rgba(0,0,0,0.45)]',
            )}
            style={{
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 4,
            }}
          >
            {submitting && (
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                className="animate-spin"
                aria-hidden
              >
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            {submitting ? 'Posting…' : 'Post listing'}
            {!submitting && (
              <span
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              >
                ↗
              </span>
            )}
          </button>
          {!submitting && (
            <p className="mono text-[11px] uppercase tracking-[0.12em] text-white/45 leading-snug">
              ↳ your agent scans open briefs and buyer profiles for a match
            </p>
          )}
        </div>

        {watchingForListingId && (
          <p className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-accent)]">
            <span
              aria-hidden
              data-instrument-blink
              className="w-[6px] h-[6px]"
              style={{
                background: 'var(--lp-accent)',
                animation: 'instrumentBlink 1.6s ease-in-out infinite',
              }}
            />
            scanning open briefs for a match
          </p>
        )}
        {error && (
          <p className="mono text-[12px] text-[#ff8a7a]">Couldn&apos;t post: {error}</p>
        )}
      </form>

      {recent.length > 0 && (() => {
        const now = Date.now();
        const visible = recent.filter((l) => !dismissed.has(l.id));
        if (visible.length === 0) {
          return (
            <div className="pt-6 border-t border-white/[0.08]">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/55 mb-3">
                YOUR LISTINGS
              </p>
              <p className="text-[13px] text-white/55">
                All terminal listings dismissed.
              </p>
            </div>
          );
        }
        return (
          <div className="pt-6 border-t border-white/[0.08]">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/55 mb-4">
              YOUR LISTINGS
            </p>
            <ul className="divide-y divide-white/[0.08]">
              {visible.slice(0, 5).map((l) => {
                const isCancelled = !!l.cancelledAt;
                const isMatched = !!l.matchedAt && !!l.matchedJobId;
                const isExpired = !isCancelled && !isMatched && (l.expiresAt ?? Infinity) <= now;
                const isTerminal = isCancelled || isMatched || isExpired;
                const label = isCancelled
                  ? 'Cancelled'
                  : isExpired
                    ? 'Expired'
                    : isMatched
                      ? 'Matched'
                      : 'Open';
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
                    aria-label={`Open listing ${l.title}`}
                    className="group cursor-pointer py-3 flex items-center justify-between gap-3 hover:bg-white/[0.04] -mx-2 px-2 transition-colors rounded-md focus:bg-white/[0.04] focus:outline-none"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold tracking-tight truncate text-white">
                        {l.title}
                      </p>
                      <p className="text-[12px] text-white/55 truncate">{l.description}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-sans text-[16px] font-extrabold tabular-nums tracking-[-0.01em] text-white">
                        {l.askingPriceUsdc}
                        <span className="ml-1 mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                          USDC
                        </span>
                      </span>
                      {isTerminal && (
                        <button
                          type="button"
                          title="Dismiss"
                          aria-label={`Dismiss ${label.toLowerCase()} listing`}
                          onClick={(e) => {
                            e.stopPropagation();
                            dismiss(l.id);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full mono text-[12px] text-white/45 hover:text-white hover:bg-white/[0.08] transition-colors"
                        >
                          ×
                        </button>
                      )}
                      <span
                        className="mono text-[10px] uppercase tracking-[0.12em] font-semibold"
                        style={{
                          color: isCancelled || isExpired ? 'rgba(255,255,255,0.55)' : 'var(--lp-accent)',
                        }}
                      >
                        {label}
                        <span
                          aria-hidden
                          className="ml-1 inline-block transition-transform duration-200 group-hover:translate-x-0.5"
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

function FieldSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <p className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-white/55">
          {eyebrow}
        </p>
        <h3 className="font-sans text-[17px] font-extrabold uppercase tracking-[-0.02em] text-white">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function FormLabel({
  label,
  unit,
  hint,
  children,
}: {
  label: string;
  unit?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 justify-between">
        <span className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] font-medium text-white/55">
          {label}
          {hint && <Hint>{hint}</Hint>}
        </span>
        {unit && (
          <span className="mono text-[9px] uppercase tracking-[0.16em] text-white/40">
            {unit}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
