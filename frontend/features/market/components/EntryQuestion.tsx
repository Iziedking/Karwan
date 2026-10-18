'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/core/api';
import { BUSINESS_ACCOUNTS_OPEN } from '@/features/account/businessOpen';
import { quietButton } from '@/features/deals/workspace/Sheet';
import { TRADE_ENTRY_COPY } from '@/features/home/tradeEntry';
import { PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';
import { useLocale } from '@/shared/i18n/LocaleProvider';

/// The one-time question at the market's entry (view 17), inline so it never
/// covers Start a trade or Find. A business answer continues to the business
/// setup, which returns to the market.
export function EntryQuestion({ address }: { address: string }) {
  const { locale } = useLocale();
  const copy = TRADE_ENTRY_COPY[locale].entry;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function choose(tradesAs: 'self' | 'business') {
    setBusy(true);
    setFailed(false);
    try {
      await api.saveSettings(address, { tradesAs });
      window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
      if (tradesAs === 'business' && BUSINESS_ACCOUNTS_OPEN) router.push('/profile/business/setup?next=/market');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="market-entry-question" className="border-y border-[var(--lp-border-light)] py-5" aria-busy={busy}>
      <h2 id="market-entry-question" className="text-[17px] font-medium text-[var(--lp-dark)]">{copy.question}</h2>
      <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{copy.note}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={busy} onClick={() => void choose('self')} className={quietButton}>
          {copy.self}
        </button>
        <button type="button" disabled={busy} onClick={() => void choose('business')} className={quietButton}>
          {copy.business}
        </button>
      </div>
      {failed ? <p role="alert" className="mt-3 text-[15px] text-[var(--lp-dark)]">{copy.saveError}</p> : null}
    </section>
  );
}
