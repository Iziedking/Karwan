'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  Band,
  FullBleed,
  GridOverlay,
  HeroHeadline,
  Punc,
  SectionTag,
} from '@/shared/components/Bands';

export default function DealError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the original trace available in the browser console without
    // exposing provider, wallet, or deal payload details to the user.
    console.error('[/deals/[id]] route error', error);
  }, [error]);

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[48ch]">
          <SectionTag tone="dark">DEAL RECOVERY</SectionTag>
          <HeroHeadline size="md">
            This deal needs a refresh<Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
            We could not load this deal view. Your agreement and funds are not
            changed by refreshing the page.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center justify-center bg-[var(--lp-accent)] px-5 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              Reload deal
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
