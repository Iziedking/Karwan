'use client';
import { useState } from 'react';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The buyer's six-digit code for goods handed over in person (view 33). It
/// shows only when asked, and asking again issues a new code.
export function HandoverCode({ jobId, caller }: { jobId: string; caller: string }) {
  const t = useTranslations().deliveryCard.code;
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setBusy(true);
    setError(null);
    try {
      setCode((await api.showHandoverCode(jobId, caller)).code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="handover-title" className="space-y-3 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
      <h2 id="handover-title" className="text-[16px] font-semibold text-[var(--lp-dark)]">{t.title}</h2>
      <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">{t.body}</p>
      {code ? (
        <>
          <p role="status" aria-live="polite" dir="ltr" className="text-center font-mono text-[34px] font-bold tracking-[0.3em] text-[var(--lp-dark)]">
            {code}
          </p>
          <p className="text-center text-[13px] font-medium text-[var(--lp-text-sub)]">{t.hint}</p>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => void show()}
        disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[var(--lp-border-light)] px-6 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {code ? t.showAgain : t.show}
      </button>
      {error ? <p role="alert" className="text-[13px] text-[var(--neg)]">{error}</p> : null}
    </section>
  );
}
