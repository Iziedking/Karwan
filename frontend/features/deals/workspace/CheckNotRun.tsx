'use client';
import { useState } from 'react';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The delivery check could not run (view 43): what each side does instead,
/// and Check again, on the card that says so. Either party can ask.
export function CheckNotRun({ jobId, viewerIsBuyer, caller, onChanged }: {
  jobId: string;
  viewerIsBuyer: boolean;
  caller: string | null;
  onChanged: () => void;
}) {
  const t = useTranslations().deliveryCard;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function checkAgain() {
    if (!caller) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await api.checkDeliveryAgain(jobId, caller);
      if (r.status === 'still-unknown') setNote(t.stillNotRun);
      else onChanged();
    } catch {
      setNote(t.stillNotRun);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-check-not-run className="space-y-2">
      <p className="text-[14px] leading-relaxed text-[var(--lp-dark)]">{viewerIsBuyer ? t.checkNotRunBuyer : t.checkNotRunSeller}</p>
      {caller ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void checkAgain()}
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60"
        >
          {busy ? t.checking : t.checkAgain}
        </button>
      ) : null}
      {note ? <p role="status" className="text-[13px] font-medium text-[var(--lp-text-sub)]">{note}</p> : null}
    </div>
  );
}
