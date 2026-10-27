'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/core/api';
import { runRecordSetup } from '@/features/record/runRecordSetup';
import { RecordDoneLine } from '@/shared/chain/RecordDoneLine';
import { useOwnWalletSend } from '@/shared/chain/useOwnWalletSend';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The receipt line (view 27, decision 11): someone with their own wallet whose
/// settled deal is not on their record can count the next ones, with one
/// signature. Optional, never in the way, shown at most once a month.
export function RecordNudge() {
  const t = useTranslations().recordOnTheWay;
  const ownWallet = useOwnWalletSend();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const noted = useRef(false);

  useEffect(() => {
    if (noted.current) return;
    noted.current = true;
    void api.recordNudgeSeen().catch(() => {});
  }, []);

  if (state === 'done') return <RecordDoneLine show />;

  async function count() {
    setState('busy');
    setError(null);
    try {
      await runRecordSetup(ownWallet);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : null);
      setState('idle');
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[14px] leading-snug text-[var(--lp-text-sub)]">{t.nudge}</p>
      <button
        type="button"
        onClick={() => void count()}
        disabled={state === 'busy'}
        aria-busy={state === 'busy'}
        className="min-h-11 rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-medium text-[var(--lp-dark)] disabled:opacity-60"
      >
        {t.nudgeButton}
      </button>
      {error ? <p role="alert" className="w-full text-[14px] leading-snug text-[var(--color-critical)]">{error}</p> : null}
    </div>
  );
}
