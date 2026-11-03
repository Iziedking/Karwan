'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/core/api';
import { runRecordSetup } from '@/features/record/runRecordSetup';
import { buttonClasses } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { useOwnWalletSend } from '@/shared/chain/useOwnWalletSend';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The one thing to do next on Home while the person's record is not on yet
/// (owner notes, 3 Nov 2026). Gone once it is on, and never shown where
/// records are not open.
export function RecordHomeNudge() {
  const t = useTranslations().recordOnTheWay;
  const ownWallet = useOwnWalletSend();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['record-setup'], queryFn: () => api.recordSetupStatus(), staleTime: 60_000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status.data?.available || status.data.complete !== false) return null;

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      await runRecordSetup(ownWallet);
      await queryClient.invalidateQueries({ queryKey: ['record-setup'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-home-nudge className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--raised)] p-4">
      <div className="flex items-center gap-3.5">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--ash)] text-[var(--ink)]">
          <Icon name="shield-check" size={20} />
        </span>
        <p className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--ink)]">{t.homeTitle}</span>
          <span className="mt-0.5 block text-[13px] text-[var(--ink-secondary)]">{t.homeBody}</span>
        </p>
        <button type="button" onClick={() => void turnOn()} disabled={busy} aria-busy={busy} className={buttonClasses({ variant: 'outline', size: 'sm', className: 'shrink-0' })}>
          {t.homeButton}
        </button>
      </div>
      {error ? <p role="alert" className="mt-3 text-[14px] leading-snug text-[var(--color-critical)]">{error}</p> : null}
    </div>
  );
}
