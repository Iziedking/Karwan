'use client';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type DirectDeal } from '@/core/api';
import { feeBreakdown } from '../config';
import { formatUsdc } from '@/shared/utils/format';
import { sfx } from '@/shared/utils/sfx';
import { CTAPill } from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { splitDeadline } from '../deadlineSplit';

const DAY_MS = 86_400_000;
/// The API caps a deadline at 180 days and 23 hours from now.
const MAX_DUE_DAYS = 180;
const MIN_REVIEW_HOURS = 24;
const MAX_REVIEW_HOURS = 720;

function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/// End of the chosen day in the person's own time zone.
function endOfDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59).getTime();
}

/// The seller gets at least a day to review the new terms, or the time they
/// had left if that is longer.
function reviewHours(deal: DirectDeal): number {
  const left = deal.acceptanceDeadlineUnix ? (deal.acceptanceDeadlineUnix * 1000 - Date.now()) / 3_600_000 : 0;
  return Math.min(MAX_REVIEW_HOURS, Math.max(MIN_REVIEW_HOURS, Math.ceil(left * 4) / 4));
}

/// Three things a buyer changes before the seller agrees: the price, the due
/// date and what gets delivered. The payment split, review window and stake
/// stay as the deal was created; only fields that changed are sent.
export function EditDealModal({
  deal,
  caller,
  onClose,
  onSaved,
  mode = 'edit',
}: {
  deal: DirectDeal;
  caller: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  mode?: 'edit' | 'counter';
}) {
  const em = useTranslations().editDealModal;
  const initialAmount = Number(deal.dealAmountUsdc) || 0;
  const initialDue = deal.deadlineUnix && deal.deadlineUnix * 1000 > Date.now() ? isoDate(deal.deadlineUnix * 1000) : '';

  const [amount, setAmount] = useState<number | ''>(initialAmount || '');
  const [due, setDue] = useState(initialDue);
  const [terms, setTerms] = useState(deal.terms);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = isoDate(Date.now());
  const lastDay = isoDate(Date.now() + MAX_DUE_DAYS * DAY_MS);
  const amountValid = typeof amount === 'number' && amount > 0;
  const dueValid = due === '' || (due >= today && due <= lastDay);
  const termsValid = terms.trim().length > 0 && terms.trim().length <= 600;
  const changed = amount !== initialAmount || due !== initialDue || terms.trim() !== deal.terms.trim();
  const canSave = changed && amountValid && dueValid && termsValid && !busy;
  const fee = amountValid ? feeBreakdown(amount) : null;

  async function submit() {
    if (!canSave || typeof amount !== 'number') return;
    setBusy(true);
    setError(null);
    try {
      const body: Parameters<typeof api.editDirectDeal>[1] = { caller, acceptanceWindowHours: reviewHours(deal) };
      if (amount !== initialAmount) body.dealAmountUsdc = amount;
      if (terms.trim() !== deal.terms.trim()) body.terms = terms.trim();
      if (due !== initialDue) {
        // An empty date makes the deal open-ended.
        const { days, hours } = splitDeadline(due ? (endOfDay(due) - Date.now()) / 1000 : 0);
        body.deadlineDays = days;
        body.deadlineHours = hours;
      }
      if (mode === 'counter') await api.counterDirectDeal(deal.jobId, body);
      else await api.editDirectDeal(deal.jobId, body);
      sfx.send();
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div
      className="fixed inset-0 z-[80] flex items-end pb-[calc(5rem+env(safe-area-inset-bottom))] sm:items-center sm:justify-end sm:p-4 md:p-6"
      style={{ background: 'rgba(14,14,14,0.55)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-terms-title"
        onClick={(e) => e.stopPropagation()}
        className="karwan-sheet-enter max-h-[calc(100dvh-5rem)] min-h-0 w-full overflow-y-auto rounded-t-[22px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] sm:max-h-[calc(100dvh-3rem)] sm:w-[min(520px,calc(100vw-2rem))] sm:rounded-[22px]"
      >
        <div className="px-6 pb-2 pt-6">
          <h2 id="edit-terms-title" className="text-[22px] font-semibold tracking-[-0.02em]">{em.title}</h2>
          <p className="mt-1.5 text-[14px] text-[var(--lp-text-sub)]">{em.body}</p>
        </div>

        <div className="space-y-5 px-6 pb-6 pt-3">
          <Field label={em.amountLabel}>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="form-input form-input-num pe-16"
              />
              <span className="pointer-events-none absolute inset-y-0 end-4 grid place-items-center text-[14px] text-[var(--lp-text-sub)]">USDC</span>
            </div>
            {fee ? (
              <span className="block text-[13px] text-[var(--lp-text-sub)]">
                {em.feeTemplate
                  .replace('{funded}', formatUsdc(fee.fundedAmount, { withSuffix: false }))
                  .replace('{seller}', formatUsdc(fee.sellerNet, { withSuffix: false }))}
              </span>
            ) : null}
          </Field>

          <Field label={em.dueLabel} aside={em.dueOptional}>
            <input
              type="date"
              value={due}
              min={today}
              max={lastDay}
              disabled={busy}
              onChange={(e) => setDue(e.target.value)}
              className="form-input"
            />
          </Field>

          <Field label={em.deliverLabel}>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              disabled={busy}
              rows={5}
              maxLength={600}
              className="form-input form-textarea"
            />
          </Field>

          {error ? <p role="alert" className="text-[13px] text-[var(--color-danger,#b03d3a)]">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <CTAPill onClick={submit} disabled={!canSave}>
              {busy ? em.saving : em.save}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              {em.cancel}
            </CTAPill>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}

function Field({ label, aside, children }: { label: string; aside?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold">{label}</span>
        {aside ? <span className="text-[12px] text-[var(--lp-text-muted)]">{aside}</span> : null}
      </span>
      {children}
    </label>
  );
}
