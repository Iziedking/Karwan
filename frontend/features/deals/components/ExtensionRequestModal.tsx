'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

const PRESETS: { key: keyof Messages['extensionRequest']['presets']; seconds: number }[] = [
  { key: 'sixHours', seconds: 6 * 3600 },
  { key: 'twelveHours', seconds: 12 * 3600 },
  { key: 'oneDay', seconds: 24 * 3600 },
  { key: 'threeDays', seconds: 3 * 24 * 3600 },
  { key: 'sevenDays', seconds: 7 * 24 * 3600 },
];

interface Props {
  jobId: string;
  callerAddress: string;
  onClose: () => void;
  onSubmitted: () => void;
}

/// Modal the seller opens from the awaiting-delivery action panel to formally
/// ask the buyer for more time. Picks a duration chip, optionally writes a
/// reason, hits send. The deal then surfaces an Approve / Decline banner on
/// the buyer's side until they respond.
export function ExtensionRequestModal({
  jobId,
  callerAddress,
  onClose,
  onSubmitted,
}: Props) {
  const er = useTranslations().extensionRequest;
  const [seconds, setSeconds] = useState<number>(PRESETS[1].seconds);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.requestExtension({
        jobId,
        caller: callerAddress,
        additionalSeconds: seconds,
        reason: reason.trim() || undefined,
      });
      onSubmitted();
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
      setError(message || er.errorFallback);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(14,14,14,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={er.ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] overflow-hidden fade-up"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 22px 64px -22px rgba(0,0,0,0.38)',
        }}
      >
        <div className="px-6 pt-6 pb-2">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {er.tag}
          </p>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
            {er.title}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
            {er.body}
          </p>
        </div>

        <div className="px-6 pt-4">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)] mb-2">
            {er.durationEyebrow}
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = seconds === p.seconds;
              return (
                <button
                  key={p.seconds}
                  type="button"
                  onClick={() => setSeconds(p.seconds)}
                  className="mono text-[11px] uppercase tracking-[0.14em] px-3 py-2 transition-colors"
                  style={{
                    background: active ? 'var(--lp-band-dark)' : 'var(--lp-light)',
                    color: active ? '#ffffff' : 'var(--lp-dark)',
                    border: active
                      ? '1px solid var(--lp-band-dark)'
                      : '1px solid var(--lp-border-light)',
                    borderTopLeftRadius: 10,
                    borderTopRightRadius: 10,
                    borderBottomLeftRadius: 10,
                    borderBottomRightRadius: 3,
                  }}
                >
                  {er.presets[p.key]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 pt-5">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)] mb-2">
            {er.reasonEyebrow}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 280))}
            rows={3}
            placeholder={er.reasonPlaceholder}
            className="w-full bg-[var(--lp-light)] text-[var(--lp-dark)] placeholder:text-[var(--lp-text-muted)] px-3.5 py-2.5 text-[13px] leading-relaxed focus:outline-none resize-none"
            style={{
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          />
        </div>

        {error && (
          <div className="px-6 pt-4">
            <p
              className="text-[12.5px] px-3 py-2"
              style={{
                background: 'rgba(176,61,58,0.10)',
                color: '#b03d3a',
                border: '1px solid rgba(176,61,58,0.35)',
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              {error}
            </p>
          </div>
        )}

        <div className="px-6 pt-6 pb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 mono text-[12px] font-bold uppercase tracking-[0.08em] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--lp-accent)',
              color: 'var(--lp-band-dark)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            {busy ? er.sending : er.send}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 mono text-[12px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50"
          >
            {er.cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
