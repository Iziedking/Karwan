'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { api, ApiError, type Listing } from '@/core/api';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';

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

  // Subscribe to global events; when a listing.matched event arrives for the
  // listing we just posted, route to the matched deal page.
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

  // Refresh listings when a new one matches (so badges update).
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
      <p className="text-[13px] text-[var(--color-ink-dim)]">
        Connect your wallet to post a listing.
      </p>
    );
  }

  const disabled = submitting || !title.trim() || !description.trim() || !price;
  const floor =
    typeof price === 'number' && typeof tolerance === 'number'
      ? (price * (1 - tolerance / 100)).toFixed(2)
      : null;

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            Title
          </span>
          <input
            type="text"
            value={title}
            maxLength={120}
            disabled={submitting}
            placeholder="e.g. Spanish→Arabic legal translation"
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)] disabled:opacity-60"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            What you offer
          </span>
          <textarea
            value={description}
            rows={3}
            maxLength={500}
            disabled={submitting}
            placeholder="Describe your offer in detail. The agent uses this to match buyer briefs."
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-[var(--color-ink)] resize-none disabled:opacity-60"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
              Asking price (USDC)
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={price}
              disabled={submitting}
              onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)] disabled:opacity-60"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
              Accept decrease (%)
            </span>
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              value={tolerance}
              disabled={submitting}
              onChange={(e) => setTolerance(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)] disabled:opacity-60"
            />
          </label>
        </div>
        {floor && (
          <p className="text-[11px] mono text-[var(--color-ink-faint)]">
            Floor: <span className="text-[var(--color-ink)]">{floor} USDC</span>. Your agent will
            reject counters below this.
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={disabled}
            style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {submitting && (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            {submitting ? 'Posting…' : 'Post listing'}
          </button>
          <p className="text-[11px] text-[var(--color-ink-faint)] leading-snug">
            Your agent scans open buyer briefs and bids when one matches.
          </p>
        </div>
        {watchingForListingId && (
          <p className="text-[11px] text-[var(--color-accent)] leading-snug mono">
            ◌ Scanning open briefs for a match…
          </p>
        )}
        {error && <p className="text-xs text-[var(--color-critical)] mono">{error}</p>}
      </form>

      {recent.length > 0 && (
        <div className="pt-4 border-t border-[var(--color-line)]">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)] mb-2">
            Your listings
          </p>
          <ul className="divide-y divide-[var(--color-line)]">
            {recent.slice(0, 5).map((l) => (
              <li key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{l.title}</p>
                  <p className="text-[11px] text-[var(--color-ink-faint)] truncate">{l.description}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="mono tabular-nums text-[13px]">
                    {l.askingPriceUsdc} <span className="text-[10px] text-[var(--color-ink-faint)]">USDC</span>
                  </span>
                  {l.matchedAt && l.matchedJobId ? (
                    <a
                      href={`/jobs/${l.matchedJobId}`}
                      className="text-[10px] uppercase tracking-[0.08em] font-semibold underline-offset-2 hover:underline"
                      style={{ color: 'var(--color-positive)' }}
                    >
                      Matched → view deal
                    </a>
                  ) : (
                    <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
                      Open
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
