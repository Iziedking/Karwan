'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Band,
  FullBleed,
  GridOverlay,
  HeroHeadline,
  Punc,
  SectionTag,
} from '@/shared/components/Bands';

// Survives error-boundary remounts in browsers that block sessionStorage, so
// one broken render can never create an automatic reset loop.
const attemptedRecoveries = new Set<string>();

export default function DealError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [autoRetrying, setAutoRetrying] = useState(true);
  const recoveryKey = `karwan:deal-recovery:${error.digest ?? error.message}`;

  useEffect(() => {
    // Keep the original trace available in the browser console without
    // exposing provider, wallet, or deal payload details to the user.
    console.error('[/deals/[id]] route error', error);
    let attempted = attemptedRecoveries.has(recoveryKey);
    try {
      attempted = attempted || window.sessionStorage.getItem(recoveryKey) === '1';
      if (!attempted) window.sessionStorage.setItem(recoveryKey, '1');
    } catch {
      // The in-memory guard still prevents a reset loop.
    }
    if (attempted) {
      setAutoRetrying(false);
      return;
    }
    attemptedRecoveries.add(recoveryKey);
    const timer = window.setTimeout(reset, 350);
    return () => window.clearTimeout(timer);
  }, [error, recoveryKey, reset]);

  const retry = () => {
    attemptedRecoveries.add(recoveryKey);
    try {
      window.sessionStorage.setItem(recoveryKey, '1');
    } catch {
      // The reset itself does not depend on storage.
    }
    setAutoRetrying(true);
    reset();
  };

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[48ch]">
          <SectionTag tone="dark">DEAL RECOVERY</SectionTag>
          <HeroHeadline size="md">
            {autoRetrying ? 'Reopening this deal' : 'Deal view did not load'}<Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
            {autoRetrying
              ? 'Karwan is retrying the view now. Your agreement is unchanged.'
              : 'Karwan could not reopen the view automatically. Try once more or return to the market.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={retry}
              disabled={autoRetrying}
              className="inline-flex min-h-11 items-center justify-center bg-[var(--lp-accent)] px-5 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              {autoRetrying ? 'Retrying…' : 'Try again'}
            </button>
            <Link
              href="/market"
              className="inline-flex min-h-11 items-center justify-center border border-[var(--lp-outline-strong)] px-5 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-text-muted)] transition-colors hover:border-[var(--lp-accent)] hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              Browse market
            </Link>
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}
