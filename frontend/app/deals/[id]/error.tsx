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
import {
  dealRouteRecoveryKey,
  shouldAutomaticallyReloadDeal,
} from '@/features/deals/dealRouteRecovery';

export default function DealError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    // Keep the original trace available in the browser console without
    // exposing provider, wallet, or deal payload details to the user.
    console.error('[/deals/[id]] route error', error);
    const recoveryKey = dealRouteRecoveryKey(window.location.pathname);
    let previousAttempt: string | null = null;
    try {
      previousAttempt = window.sessionStorage.getItem(recoveryKey);
    } catch {
      // Continue to the fallback if storage is unavailable. Reloading without
      // a durable guard could trap the user in a loop.
      setShowFallback(true);
      return;
    }

    const now = Date.now();
    if (!shouldAutomaticallyReloadDeal(previousAttempt, now)) {
      setShowFallback(true);
      return;
    }

    try {
      window.sessionStorage.setItem(recoveryKey, String(now));
    } catch {
      // Reads can succeed even when storage is full or writes are blocked.
      // Do not reload unless the loop guard was persisted.
      setShowFallback(true);
      return;
    }
    window.location.reload();
  }, [error]);

  const retry = () => {
    const recoveryKey = dealRouteRecoveryKey(window.location.pathname);
    try {
      window.sessionStorage.setItem(recoveryKey, String(Date.now()));
    } catch {
      // A user-triggered reload is safe even when storage is unavailable.
    }
    window.location.reload();
  };

  if (!showFallback) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div role="status" aria-live="polite" className="max-w-[44ch] min-h-[44vh] space-y-4">
            <span className="sr-only">Opening deal</span>
            <div className="h-3 w-28 rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
            <div className="h-12 w-64 rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-44 rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
          </div>
        </Band>
      </FullBleed>
    );
  }

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[48ch]">
          <SectionTag tone="dark">DEAL RECOVERY</SectionTag>
          <HeroHeadline size="md">
            We could not open this deal<Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
            Your agreement is unchanged. Try once more or return to your trades.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={retry}
              className="inline-flex min-h-11 items-center justify-center bg-[var(--lp-accent)] px-5 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              Try again
            </button>
            <Link
              href="/buyer"
              className="inline-flex min-h-11 items-center justify-center border border-[var(--lp-outline-strong)] px-5 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-text-muted)] transition-colors hover:border-[var(--lp-accent)] hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              Your trades
            </Link>
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}
