'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { buttonClasses } from '@/shared/components/Button';

/// Shown when the only topical match sits far past the buyer's ceiling, so the
/// deal can never settle at this budget. Non-destructive: the request stays open
/// for a cheaper seller. This card just stops the "negotiating" spinner and
/// explains the gap, with a one-tap path to repost at a workable budget. When
/// the buyer passed a real price earlier and nothing cheaper turned up, it also
/// offers to reconsider that exact offer (re-raises the near-miss to proceed).
/// "Keep waiting" hides it for this deal so the page goes quiet.

const dismissKey = (jobId: string) => `karwan.outofreach.dismissed.${jobId}`;

export function OutOfReachCard({
  jobId,
  closestFloorUsdc,
  budgetUsdc,
  passedPriceUsdc,
  caller,
  onReconsidered,
}: {
  jobId: string;
  closestFloorUsdc: number;
  budgetUsdc: number;
  passedPriceUsdc: number | null;
  caller: string | undefined;
  onReconsidered: () => Promise<void> | void;
}) {
  const c = useTranslations().liveJob.outOfReach;
  const router = useRouter();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissKey(jobId)) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  const floor = Math.round(closestFloorUsdc);
  const budget = Math.round(budgetUsdc);
  const canReconsider = passedPriceUsdc != null && !!caller;

  function keepWaiting() {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(jobId), '1');
    } catch {
      /* storage unavailable */
    }
  }

  async function reconsider() {
    if (!caller || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.reconsiderPassed(jobId, caller);
      // The near-miss is back on the table: hand off to the near-miss card.
      await onReconsidered();
      setDismissed(true);
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-5 py-4">
      <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--lp-text-sub)]">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--color-warning)]" />
        {c.tag}
      </p>
      <h3 className="mt-2 text-[18px] font-semibold leading-snug text-[var(--lp-dark)]">{c.title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
        {c.bodyTemplate
          .replace('{floor}', String(floor))
          .replace('{budget}', String(budget))}
      </p>
      {canReconsider && (
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
          {c.reconsiderHintTemplate.replace('{price}', String(Math.round(passedPriceUsdc!)))}
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] text-[var(--color-critical)]">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canReconsider && (
          <button type="button" onClick={reconsider} disabled={busy} className={buttonClasses({ className: 'rounded-full px-5' })}>
            {busy
              ? c.reconsiderBusy
              : c.reconsiderCtaTemplate.replace('{price}', String(Math.round(passedPriceUsdc!)))}
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push(`/buyer?budget=${floor}#new-deal`)}
          className={buttonClasses({ variant: canReconsider ? 'outline' : 'primary', className: 'rounded-full px-5' })}
        >
          {c.raiseCta}
        </button>
        <button type="button" onClick={keepWaiting} className={buttonClasses({ variant: 'ghost', className: 'rounded-full px-4' })}>
          {c.waitCta}
        </button>
      </div>
    </section>
  );
}
