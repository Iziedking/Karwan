'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { Band, FullBleed, GridOverlay, HeroHeadline, Punc, SectionTag } from '@/shared/components/Bands';

/// Route-level error boundary for /app. A client-side throw here used to
/// blank the route to the generic "Application error: a client-side
/// exception has occurred while loading karwan.site" page. The user had
/// no path back except a manual refresh. Most observed crashes were
/// auth-state transitions (logout while a child component still held a
/// stale dependency), so a Reload button that bounces them through
/// /app's own boundary clears the bad state most of the time.
///
/// We log the error to the console (and would forward to Sentry in
/// production if wired) so the original cause stays discoverable.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[/app] route error', error);
  }, [error]);

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <SectionTag tone="dark">[:OOPS:]</SectionTag>
        <HeroHeadline>
          Something tripped<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
          The page hit a snag while loading. This usually clears after a
          reload, and if it doesn't, sign in again. We logged the trace.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="mono text-[11px] font-bold uppercase tracking-[0.1em] px-5 py-2.5 transition-colors"
            style={{
              background: 'var(--lp-accent)',
              color: 'var(--lp-dark)',
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 3,
            }}
          >
            Reload
          </button>
          <Link
            href="/"
            className="mono text-[11px] font-bold uppercase tracking-[0.1em] px-5 py-2.5 transition-colors"
            style={{
              background: 'transparent',
              color: 'var(--ink-2)',
              border: '1px solid var(--rule-dark)',
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 3,
            }}
          >
            Back home
          </Link>
        </div>
      </Band>
    </FullBleed>
  );
}
