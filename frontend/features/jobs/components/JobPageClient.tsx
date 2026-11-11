'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { api, ApiError, type BuyerJob } from '@/core/api';
import { settlementExplorer } from '@/core/arcNetwork';
import { useAuth } from '@/shared/hooks/useAuth';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { PAGE_REFRESH_EVENT } from '@/shared/utils/pageRefresh';
import { RequestPage } from '@/features/search/components/RequestPage';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { OfferPanel } from '@/features/offers/components/OfferPanel';
import { BuyerOffers } from '@/features/offers/components/BuyerOffers';
import { YOUR_TRADES_HREF } from '@/features/market/marketQuery';

/// Client-side wrapper for /jobs/[id]. Replaces the previous async server
/// component so navigation into a job page is instant; the loading.tsx
/// skeleton covers the route transition and the job data fetches on mount.
/// Without this, every click had to wait for the backend to return before
/// the page even appeared.
// Retry schedule for the first job-fetch. The buyer agent populates its in-
// memory jobs Map from the on-chain `JobPosted` event, which takes a few
// seconds to land after the user posts a brief and lands here. Without
// retries, the page would briefly show a "not tracked" error and the user
// would assume the brief was lost. Total wait is ~15.5s before we give up.
const NOT_FOUND_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];

function isNotFoundError(message: string): boolean {
  return /not found/i.test(message);
}

export function JobPageClient({ jobId }: { jobId: string }) {
  const t = useTranslations();
  const jp = t.jobPage;
  const auth = useAuth();
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; job: BuyerJob; explorer: string }
    | { kind: 'private'; status: NonNullable<BuyerJob['status']> }
    | { kind: 'error'; message: string; isNotFound: boolean }
  >({ kind: 'loading' });
  // Bumped to read the job again in place: a live event on this request, a
  // return to the tab, or a notification that points at this page.
  const [reloadKey, setReloadKey] = useState(0);
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setReloadKey((key) => key + 1), 400);
    };
    const offLive = subscribeLiveEvents((e) => {
      if (e.jobId && e.jobId.toLowerCase() === jobId.toLowerCase()) reload();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(PAGE_REFRESH_EVENT, reload);
    return () => {
      offLive();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(PAGE_REFRESH_EVENT, reload);
    };
  }, [jobId]);

  useEffect(() => {
    // Wait until we know who the viewer is. the gated read passes the address as
    // a caller hint (web3 users have no session), so fetching before auth
    // resolves would read as a non-party and wrongly show the private view.
    if (auth.isLoading) return;
    let cancelled = false;
    // Only a different request shows the loading state; a re-read swaps in place.
    if (shownFor.current !== jobId) setState({ kind: 'loading' });

    async function fetchJobWithRetry(): Promise<BuyerJob | { __error: string }> {
      let lastError = '';
      for (let attempt = 0; attempt <= NOT_FOUND_RETRY_DELAYS_MS.length; attempt += 1) {
        if (cancelled) return { __error: 'cancelled' };
        try {
          return (await api.job(jobId, auth.address)) as BuyerJob;
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err);
          lastError = message;
          // Only retry on 404-style "not found"; other errors are reported
          // immediately. The buyer agent typically picks up the new brief
          // within 2-3 seconds; we have headroom up to ~15s.
          if (!isNotFoundError(message)) {
            return { __error: message };
          }
          if (attempt === NOT_FOUND_RETRY_DELAYS_MS.length) break;
          await new Promise((resolve) =>
            setTimeout(resolve, NOT_FOUND_RETRY_DELAYS_MS[attempt]),
          );
        }
      }
      return { __error: lastError };
    }

    Promise.all([fetchJobWithRetry(), api.status().catch(() => null)]).then(
      ([jobOrError, status]) => {
        if (cancelled) return;
        if (jobOrError && '__error' in jobOrError) {
          const notFound = isNotFoundError(jobOrError.__error);
          setState({ kind: 'error', message: jobOrError.__error, isNotFound: notFound });
          return;
        }
        const job = jobOrError as BuyerJob;
        // Privacy gate: non-parties get a status-only stub. Render the private
        // view instead of the live auction (which they have no data for).
        if (job.isParty === false) {
          setState({ kind: 'private', status: job.status ?? 'open' });
          return;
        }
        const explorer = status?.chain.explorer ?? settlementExplorer;
        shownFor.current = jobId;
        setState({ kind: 'ready', job, explorer });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [jobId, auth.address, auth.isLoading, reloadKey]);

  if (state.kind === 'loading') {
    // The shape of the request page while it loads, in the new look: no words
    // to read, the min-h keeps the page from jumping when it arrives.
    return (
      <div className="mx-auto min-h-[44vh] max-w-[640px] px-5 py-8" aria-busy="true">
        <span className="sr-only" role="status">{jp.loading.headline}</span>
        <div className="h-7 w-2/3 rounded-[8px] bg-[var(--ash)] motion-safe:animate-pulse" />
        <div className="mt-3 h-4 w-1/3 rounded-[6px] bg-[var(--ash)] motion-safe:animate-pulse" />
        <div className={`${CARD_CLASS} mt-6 space-y-4 p-5`}>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4">
              <div className="h-4 w-1/3 rounded-[6px] bg-[var(--ash)] motion-safe:animate-pulse" />
              <div className="h-4 w-1/5 rounded-[6px] bg-[var(--ash)] motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === 'private') {
    const negotiating = state.status === 'negotiating';
    const closed = state.status === 'ended' || state.status === 'cancelled' || state.status === 'expired';
    const variant = negotiating ? 'negotiating' : closed ? 'closed' : 'default';
    // A seller who is not a party yet sees the open request and can offer on
    // it; a closed or unknown request keeps the status-only view.
    const privateView = (
      <StatePage title={jp.private.headlines[variant]} body={jp.private.bodies[variant]}>
        <Link href="/market" className={buttonClasses({ size: 'lg' })}>{jp.private.browseCta}</Link>
        <Link href="/buyer" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{jp.private.postCta}</Link>
      </StatePage>
    );
    return <OfferPanel jobId={jobId} fallback={privateView} />;
  }

  if (state.kind === 'error') {
    return (
      <StatePage
        title={state.isNotFound ? jp.error.notFoundHeadline : jp.error.errorHeadline}
        body={state.isNotFound ? jp.error.notFoundBody : jp.error.errorBody}
      >
        <Link href={YOUR_TRADES_HREF} className={buttonClasses({ size: 'lg' })}>{jp.error.backCta}</Link>
        <Link href="/activity" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{jp.error.activityCta}</Link>
      </StatePage>
    );
  }

  // The request page (view 44, Batch 6); an old ?search=v1 link opens it too.
  const page = <RequestPage initial={state.job} explorer={state.explorer} />;
  return state.job.viewerIsBuyer !== false ? (
    <>
      <BuyerOffers jobId={jobId} budgetUsdc={state.job.budgetUsdc} budgetLocal={state.job.budgetLocal} />
      {page}
    </>
  ) : (
    page
  );
}

/// A request that cannot be shown, or is not yours to see, in the new look.
function StatePage({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[640px] px-5 py-10">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">{title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{body}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">{children}</div>
    </div>
  );
}
