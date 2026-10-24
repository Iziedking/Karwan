'use client';

import { useState } from 'react';
import { Sheet } from '@/features/deals/workspace/Sheet';
import { cn } from '@/shared/utils/cn';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { offerPhotosCopy } from '@/shared/i18n/messages/offerPhotos';
import { reportOffer } from '../photos';

/// A quiet way for anyone signed in to tell the team an offer or its photos
/// are wrong. The team reviews it (view 28: photos are reviewed when reported).
export function ReportOffer({ listingId, hasPhotos }: { listingId: string; hasPhotos: boolean }) {
  const { locale } = useLocale();
  const t = offerPhotosCopy[locale];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<'photo' | 'listing'>(hasPhotos ? 'photo' : 'listing');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  async function send() {
    setState('sending');
    try {
      await reportOffer(listingId, reason, note);
      setState('sent');
    } catch {
      setState('failed');
    }
  }

  const choice = (value: 'photo' | 'listing', label: string) => (
    <button
      type="button"
      aria-pressed={reason === value}
      onClick={() => setReason(value)}
      className={cn(
        'flex min-h-12 w-full items-center rounded-[14px] border px-4 text-start text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        reason === value ? 'border-[var(--lp-dark)] text-[var(--lp-dark)]' : 'border-[var(--lp-border-light)] text-[var(--lp-text-sub)]',
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setState('idle'); }}
        className="mt-6 inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-text-sub)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {t.report}
      </button>
      <Sheet open={open} title={t.reportTitle} onClose={() => setOpen(false)} busy={state === 'sending'}>
        {state === 'sent' ? (
          <p role="status" className="text-[15px] font-medium text-[var(--lp-dark)]">{t.reportSent}</p>
        ) : (
          <div className="space-y-3">
            {hasPhotos ? choice('photo', t.reportPhoto) : null}
            {choice('listing', t.reportListing)}
            <label className="block pt-2">
              <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">{t.reportNote}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
                className="form-input form-textarea mt-1.5"
              />
            </label>
            {state === 'failed' ? <p role="alert" className="text-[14px] font-medium text-[var(--color-critical)]">{t.reportFailed}</p> : null}
            <button
              type="button"
              onClick={() => void send()}
              disabled={state === 'sending'}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[15px] font-semibold text-[var(--on-action)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2"
            >
              {t.reportSend}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
