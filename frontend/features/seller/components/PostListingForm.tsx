'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { api, ApiError, type Listing } from '@/core/api';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';
import { Hint } from '@/shared/components/Hint';
import { cn } from '@/shared/utils/cn';

export function PostListingForm() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number | ''>(30);
  const [tolerance, setTolerance] = useState<number | ''>(15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Listing[]>([]);
  const [watchingForListingId, setWatchingForListingId] = useState<string | null>(null);
  const watchedListingRef = useRef<string | null>(null);

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
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.postListing({
        sellerUser: address,
        title: title.trim(),
        description: description.trim(),
        askingPriceUsdc: price,
        negotiationMaxDecreasePct: typeof tolerance === 'number' ? tolerance : undefined,
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
        Connect your wallet to post a listing.
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
        {/* LISTING PREVIEW — big editorial display */}
        <div
          className="relative overflow-hidden"
          style={{
            background: 'var(--lp-accent)',
            color: 'var(--lp-dark)',
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
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-dark)]/65">
              LISTING PREVIEW
            </p>
            <div className="mt-3 flex items-baseline gap-2 flex-wrap">
              <span className="font-sans text-[clamp(2.5rem,6vw,3.75rem)] font-extrabold tabular-nums tracking-[-0.03em] leading-none">
                {previewPrice}
              </span>
              <span className="mono text-[12px] uppercase tracking-[0.12em] text-[var(--lp-dark)]/65">
                USDC
              </span>
              <span aria-hidden className="ml-2 mb-1 w-px h-7 bg-[var(--lp-dark)]/20" />
              <span className="font-sans text-[clamp(1.5rem,3.4vw,2rem)] font-extrabold tabular-nums tracking-[-0.02em] leading-none">
                −{previewTol}%
              </span>
              <span className="mono text-[12px] uppercase tracking-[0.12em] text-[var(--lp-dark)]/65">
                accept
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] mono text-[var(--lp-dark)]/65">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  data-instrument-blink
                  className="w-[6px] h-[6px]"
                  style={{
                    background: 'var(--lp-dark)',
                    animation: 'instrumentBlink 1.6s ease-in-out infinite',
                  }}
                />
                agent listening
              </span>
              {floor && (
                <>
                  <span aria-hidden className="w-px h-3 bg-[var(--lp-dark)]/20" />
                  <span>floor {floor} USDC</span>
                </>
              )}
              <span aria-hidden className="w-px h-3 bg-[var(--lp-dark)]/20" />
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
              onChange={(e) => setTitle(e.target.value)}
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
              onChange={(e) => setDescription(e.target.value)}
              className="form-input-dark form-textarea-dark"
            />
          </FormLabel>
        </FieldSection>

        {/* PRICING */}
        <FieldSection eyebrow="PRICING" title="Set your asking and the floor.">
          <div className="grid grid-cols-2 gap-3">
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
          </div>
        </FieldSection>

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
                : 'bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_0_rgba(0,0,0,0.45)] hover:shadow-[0_5px_0_rgba(0,0,0,0.45)] active:shadow-[0_1px_0_rgba(0,0,0,0.45)]',
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
              ↳ your agent scans briefs and bids when matched
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

      {recent.length > 0 && (
        <div className="pt-6 border-t border-white/[0.08]">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/55 mb-4">
            YOUR LISTINGS
          </p>
          <ul className="divide-y divide-white/[0.08]">
            {recent.slice(0, 5).map((l) => (
              <li
                key={l.id}
                className="py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] -mx-2 px-2 transition-colors rounded-md"
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
                  {l.matchedAt && l.matchedJobId ? (
                    <a
                      href={`/jobs/${l.matchedJobId}`}
                      className="mono text-[10px] uppercase tracking-[0.12em] font-semibold underline-offset-2 hover:underline"
                      style={{ color: 'var(--lp-accent)' }}
                    >
                      Matched ↗
                    </a>
                  ) : (
                    <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/45">
                      Open
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <style jsx>{`
        :global(.form-input-dark) {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.10);
          color: white;
          padding: 12px 14px;
          font-size: 14px;
          transition: border-color 200ms, box-shadow 200ms;
          border-top-left-radius: 12px;
          border-top-right-radius: 12px;
          border-bottom-left-radius: 12px;
          border-bottom-right-radius: 3px;
        }
        :global(.form-input-dark:focus) {
          outline: none;
          border-color: var(--lp-accent);
          box-shadow: 0 0 0 3px rgba(212, 255, 63, 0.20);
        }
        :global(.form-input-dark:disabled) {
          opacity: 0.5;
          cursor: not-allowed;
        }
        :global(.form-input-dark::placeholder) {
          color: rgba(255, 255, 255, 0.35);
        }
        :global(.form-textarea-dark) {
          resize: none;
          line-height: 1.5;
        }
        :global(.form-input-num-dark) {
          font-family: var(--font-mono);
          font-feature-settings: 'tnum';
          font-size: 20px;
          font-weight: 700;
        }
      `}</style>
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
