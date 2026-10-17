'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { marketReadsCopy } from '@/shared/i18n/messages/marketReads';

const SEEN_KEY = 'karwan:market-reads-notice:v1';

/// The one line under a post or bid button: posting lets the agents of people
/// you might deal with check your record.
export function MarketReadsNote() {
  const { locale } = useLocale();
  return <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{marketReadsCopy[locale].note}</p>;
}

/// Tells someone who already posts, once, that agents may now check their record.
export function MarketReadsNotice() {
  const { locale } = useLocale();
  const copy = marketReadsCopy[locale];
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(SEEN_KEY) !== '1');
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 py-3">
      <p className="min-w-0 flex-1 text-[14px] font-medium text-[var(--lp-dark)]">{copy.notice}</p>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(SEEN_KEY, '1');
          } catch {
            /* the notice simply shows again next time */
          }
          setShow(false);
        }}
        className="inline-flex min-h-11 items-center rounded-full px-3 text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {copy.dismiss}
      </button>
    </div>
  );
}
