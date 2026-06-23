'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

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
    <div
      className="bg-[var(--lp-card)] border p-5 sm:p-6"
      style={{
        borderColor: 'var(--lp-border-light)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 4,
      }}
    >
      <span className="mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:{c.tag}:]
      </span>
      <h3 className="mt-2 font-sans text-[20px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
        {c.title}
      </h3>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
        {c.bodyTemplate
          .replace('{floor}', String(floor))
          .replace('{budget}', String(budget))}
      </p>
      {canReconsider && (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
          {c.reconsiderHintTemplate.replace('{price}', String(Math.round(passedPriceUsdc!)))}
        </p>
      )}
      {error && <p className="mt-2 mono text-[11px] text-[#b03d3a]">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canReconsider && (
          <button
            type="button"
            onClick={reconsider}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-[10px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors disabled:opacity-60"
            style={{
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 3,
            }}
          >
            {busy
              ? c.reconsiderBusy
              : c.reconsiderCtaTemplate.replace('{price}', String(Math.round(passedPriceUsdc!)))}
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push(`/buyer?budget=${floor}#new-deal`)}
          className={
            canReconsider
              ? 'mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]'
              : 'inline-flex items-center gap-2 px-4 py-[10px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors'
          }
          style={
            canReconsider
              ? undefined
              : {
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 10,
                  borderBottomRightRadius: 3,
                }
          }
        >
          {c.raiseCta}
          {!canReconsider && <span aria-hidden>→</span>}
        </button>
        <button
          type="button"
          onClick={keepWaiting}
          className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]"
        >
          {c.waitCta}
        </button>
      </div>
    </div>
  );
}
