'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ChainEvent } from '@/core/api';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';

/// Non-destructive overpay advisory. When the buyer agent finds the budget sits
/// well above a grounded market price, it surfaces here — the operator decides
/// whether to proceed or reopen at market. The agent never cancels on its own.
/// Persisted, so it shows live over SSE AND reappears on a refresh; dismissal is
/// remembered per deal in localStorage so it stays dismissed.

interface Advisory {
  fairPriceUsdc?: number;
  budgetUsdc?: number;
  overPct?: number;
  note?: string;
}

const dismissKey = (jobId: string) => `karwan.advisory.dismissed.${jobId}`;

export function MarketAdvisoryBanner({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [adv, setAdv] = useState<Advisory | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Persisted load + live updates. The fetch reappears it after a refresh; the
  // SSE subscription shows it the moment it fires during the auction.
  useEffect(() => {
    let cancelled = false;
    try {
      if (localStorage.getItem(dismissKey(jobId)) === '1') setDismissed(true);
    } catch {
      /* storage unavailable */
    }
    api
      .marketAdvisory(jobId)
      .then((r) => {
        if (cancelled || !r.advisory) return;
        setAdv({
          fairPriceUsdc: r.advisory.fairPriceUsdc,
          budgetUsdc: r.advisory.budgetUsdc,
          overPct: r.advisory.overPct,
          note: r.advisory.note,
        });
      })
      .catch(() => {
        /* best-effort; SSE still fills in live */
      });
    const unsub = subscribeLiveEvents((e: ChainEvent) => {
      if (e.type !== 'negotiation.market-advisory' || e.jobId !== jobId) return;
      const p = e.payload;
      setAdv({
        fairPriceUsdc: typeof p.fairPriceUsdc === 'number' ? p.fairPriceUsdc : undefined,
        budgetUsdc: typeof p.budgetUsdc === 'number' ? p.budgetUsdc : undefined,
        overPct: typeof p.overPct === 'number' ? p.overPct : undefined,
        note: typeof p.note === 'string' ? p.note : undefined,
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [jobId]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(jobId), '1');
    } catch {
      /* storage unavailable */
    }
  }

  if (!adv || dismissed) return null;

  return (
    <div
      className="bg-[#fff7e8] border border-[#e8c97a] p-4 sm:p-5 text-[#5a4a1f]"
      style={{ borderRadius: 16, borderBottomRightRadius: 4 }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a7b2f]">
          [:MARKET CHECK:]
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="mono text-[10px] uppercase tracking-[0.12em] text-[#9a7b2f] hover:text-[#5a4a1f]"
        >
          dismiss
        </button>
      </div>
      <p className="mt-2 text-[14px] leading-snug font-medium">
        This looks like about{' '}
        <strong>${adv.fairPriceUsdc != null ? adv.fairPriceUsdc.toFixed(0) : '—'}</strong> in the
        market right now
        {adv.budgetUsdc != null && (
          <>
            , and you&apos;re set up to pay up to <strong>${adv.budgetUsdc.toFixed(0)}</strong>
            {adv.overPct != null && <> (~{adv.overPct}% above market)</>}
          </>
        )}
        .
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-[#6a5a2f]">
        You can still proceed at your price, or reopen the request closer to the market rate to pay
        less.
        {adv.note ? ` ${adv.note}` : ''}
      </p>
      {adv.fairPriceUsdc != null && (
        <button
          type="button"
          onClick={() => router.push(`/buyer?budget=${Math.round(adv.fairPriceUsdc!)}#new-deal`)}
          className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#5a4a1f] text-[#fff7e8] mono text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-[#6a5a2f] transition-colors"
        >
          reopen at ~${adv.fairPriceUsdc.toFixed(0)} →
        </button>
      )}
    </div>
  );
}
