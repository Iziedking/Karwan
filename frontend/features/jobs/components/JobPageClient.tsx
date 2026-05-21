'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type BuyerJob } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { LiveJobPage } from './LiveJobPage';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  CTAPill,
} from '@/shared/components/Bands';

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
  const auth = useAuth();
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; job: BuyerJob; explorer: string }
    | { kind: 'private'; status: NonNullable<BuyerJob['status']> }
    | { kind: 'error'; message: string; isNotFound: boolean }
  >({ kind: 'loading' });

  useEffect(() => {
    // Wait until we know who the viewer is. the gated read passes the address as
    // a caller hint (web3 users have no session), so fetching before auth
    // resolves would read as a non-party and wrongly show the private view.
    if (auth.isLoading) return;
    let cancelled = false;
    setState({ kind: 'loading' });

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
        const explorer = status?.chain.explorer ?? 'https://testnet.arcscan.app';
        setState({ kind: 'ready', job, explorer });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [jobId, auth.address, auth.isLoading]);

  if (state.kind === 'loading') {
    // Match the loading.tsx feel: render the route shell so the transition
    // doesn't look broken. The shared loading.tsx covers the inter-route
    // hop; this state covers data-fetch latency once we've landed.
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[48ch] fade-up">
            <SectionTag tone="dark">LOADING JOB</SectionTag>
            <HeroHeadline size="md">
              Fetching the brief
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              Reading the live state from the buyer agent.
            </p>
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (state.kind === 'private') {
    const negotiating = state.status === 'negotiating';
    const closed = state.status === 'cancelled' || state.status === 'expired';
    const tag = negotiating ? 'IN NEGOTIATION' : closed ? 'CLOSED' : 'COLLECTING BIDS';
    const head = negotiating
      ? 'This deal is private'
      : closed
        ? 'This brief is closed'
        : 'This brief is collecting bids';
    const body = negotiating
      ? 'Two parties are settling this deal privately. You cannot see the negotiation. Post a listing so buyers or an agent can find you, or wait for another opportunity.'
      : closed
        ? 'This brief is no longer open.'
        : 'Only the buyer who posted this brief can see its live auction. Post your own brief, or list what you offer and let buyers come to you.';
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[48ch] fade-up">
            <SectionTag tone="dark">{tag}</SectionTag>
            <HeroHeadline size="md">
              {head}
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {body}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CTAPill href="/market">Browse the market</CTAPill>
              <Link
                href="/buyer"
                className="mono text-[11px] uppercase tracking-[0.12em] text-white/55 hover:text-white"
              >
                Post a brief →
              </Link>
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (state.kind === 'error') {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[48ch] fade-up">
            <SectionTag tone="dark">
              {state.isNotFound ? 'BRIEF NOT TRACKED YET' : 'JOB ERROR'}
            </SectionTag>
            <HeroHeadline size="md">
              {state.isNotFound ? 'We could not find this brief' : 'Could not load this job'}
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {state.isNotFound
                ? 'The backend has no record of this jobId. If you just posted it, give the buyer agent a few more seconds to pick up the on-chain event and try refreshing. If it stays missing, the id may be wrong.'
                : 'The job id may be wrong, or the backend has not seen it.'}
            </p>
            <p className="mt-3 mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-white/45 break-all">
              {jobId}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CTAPill href="/buyer">Back to buyer desk</CTAPill>
              <Link
                href="/activity"
                className="mono text-[11px] uppercase tracking-[0.12em] text-white/55 hover:text-white"
              >
                See activity →
              </Link>
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  return <LiveJobPage initial={state.job} explorer={state.explorer} />;
}
