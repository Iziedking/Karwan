'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type BuyerJob } from '@/core/api';
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
export function JobPageClient({ jobId }: { jobId: string }) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; job: BuyerJob; explorer: string }
    | { kind: 'error'; message: string; isExpired: boolean }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.job(jobId).catch((err: unknown) => {
        if (err instanceof ApiError) return { __error: err.message } as const;
        return { __error: err instanceof Error ? err.message : String(err) } as const;
      }),
      api.status().catch(() => null),
    ]).then(([jobOrError, status]) => {
      if (cancelled) return;
      if (jobOrError && '__error' in jobOrError) {
        const isExpired = /not found/i.test(jobOrError.__error);
        setState({ kind: 'error', message: jobOrError.__error, isExpired });
        return;
      }
      const explorer = status?.chain.explorer ?? 'https://testnet.arcscan.app';
      setState({ kind: 'ready', job: jobOrError as BuyerJob, explorer });
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

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

  if (state.kind === 'error') {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[48ch] fade-up">
            <SectionTag tone="dark">
              {state.isExpired ? 'BRIEF NO LONGER TRACKED' : 'JOB ERROR'}
            </SectionTag>
            <HeroHeadline size="md">
              {state.isExpired ? 'This brief expired' : 'Could not load this job'}
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {state.isExpired
                ? "It passed its deadline without a feasible match, so the agent stopped tracking it. The chain still holds the original brief; nothing was funded."
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
