'use client';
import { useState } from 'react';
import { ApiError, api, type DirectDeal } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { EditDealModal } from '../components/EditDealModal';

const quietButton =
  'inline-flex min-h-11 items-center rounded-full bg-[var(--tint)] px-5 text-[15px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:bg-[var(--line)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';
const mainButton =
  'inline-flex min-h-11 items-center rounded-full bg-[var(--action)] px-5 text-[15px] font-medium text-[var(--on-action)] transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';

/// Before the seller agrees: the seller can turn the terms down with a note,
/// and the buyer reads that note and changes the terms. Nothing moves on chain.
export function TurnDown({
  deal,
  address,
  viewerIsBuyer,
  onChanged,
}: {
  deal: DirectDeal;
  address: string | null;
  viewerIsBuyer: boolean;
  onChanged: () => void;
}) {
  const copy = useTranslations().directDealDetail.actionPanel.awaitingAcceptance;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (deal.view?.stage !== 'awaiting-acceptance' || !address || deal.pendingCounterparty) return null;

  async function send() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      await api.declineDirectDeal(deal.jobId, { caller: address, note: note.trim() });
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const noteBlock = deal.sellerDeclineNote ? (
    <p dir="auto" className="whitespace-pre-wrap rounded-[12px] border border-[var(--lp-border-light)] px-3 py-2 text-[15px] leading-relaxed text-[var(--lp-dark)]">
      {deal.sellerDeclineNote}
    </p>
  ) : null;

  if (viewerIsBuyer) {
    if (!deal.sellerDeclinedAt) return null;
    return (
      <section aria-labelledby="deal-turned-down" className="space-y-3">
        <h2 id="deal-turned-down" className="text-[20px] font-medium text-[var(--lp-dark)]">{copy.buyerDeclinedTitle}</h2>
        {noteBlock}
        <p className="text-[14px] text-[var(--lp-text-sub)]">{copy.buyerDeclinedBody}</p>
        <button type="button" onClick={() => setEditing(true)} className={mainButton}>
          {copy.editTermsCta}
        </button>
        {editing ? (
          <EditDealModal
            deal={deal}
            caller={address}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
          />
        ) : null}
      </section>
    );
  }

  if (deal.sellerDeclinedAt) {
    return (
      <section className="space-y-3">
        <p className="text-[14px] text-[var(--lp-text-sub)]">{copy.sellerDeclined}</p>
        {noteBlock}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {open ? (
        <>
          <label className="block text-[14px] font-semibold text-[var(--lp-dark)]">
            {copy.declineLabel}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={600}
              rows={3}
              dir="auto"
              placeholder={copy.declinePlaceholder}
              className="form-input mt-1.5 block font-normal"
            />
          </label>
          {error ? <p role="alert" className="text-[14px] text-[var(--color-critical)]">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void send()} disabled={busy || !note.trim()} className={quietButton}>
              {busy ? copy.declineBusy : copy.declineSend}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className={quietButton}>
              {copy.declineBack}
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={quietButton}>
          {copy.declineCta}
        </button>
      )}
    </section>
  );
}
