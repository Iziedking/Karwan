'use client';
import { useState } from 'react';
import { ApiError, api, type DirectDeal } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ConfirmSheet } from './ConfirmSheet';

/// The buyer can walk away while nothing is funded. Once money is held the
/// refund paths on the deal take over.
export function BuyerCancel({ deal, address, viewerIsBuyer, onChanged }: {
  deal: DirectDeal;
  address: string | null;
  viewerIsBuyer: boolean;
  onChanged: () => void;
}) {
  const copy = useTranslations().dealWorkspace.cancelDeal;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stage = deal.view?.stage;
  if (!viewerIsBuyer || !address || deal.fundTxHash || (stage !== 'awaiting-acceptance' && stage !== 'awaiting-funding')) return null;

  async function confirm() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelDirectDeal(deal.jobId, address);
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
      >
        {copy.cta}
      </button>
      <ConfirmSheet
        open={open}
        title={copy.title}
        consequence={copy.consequence}
        irreversible
        busy={busy}
        confirmVariant="secondary"
        error={error}
        onConfirm={() => void confirm()}
        onClose={() => { if (!busy) setOpen(false); }}
      />
    </div>
  );
}
