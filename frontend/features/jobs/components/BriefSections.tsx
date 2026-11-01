'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { api, ApiError, type BuyerJob } from '@/core/api';
import { EDIT_REQUEST_EVENT } from '@/shared/components/MarketAdvisoryBanner';
import { SectionTag, PageCard, CTAPill } from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { briefOpenForChange } from '../briefOpen';

export function EditBriefSection({
  job,
  matchPending,
  viewerIsSeller,
  callerAddress,
  isBuyer,
  onEdited,
}: {
  job: BuyerJob;
  matchPending: boolean;
  viewerIsSeller: boolean;
  callerAddress: string | undefined;
  /// The viewer is the buyer who posted this request. `job.buyer` is the
  /// buyer AGENT address, so an address comparison never matches the user.
  isBuyer?: boolean;
  onEdited: () => Promise<void> | void;
}) {
  const es = useTranslations().liveJob.editSection;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewerIsBuyer =
    isBuyer ?? (!!callerAddress && callerAddress.toLowerCase() === job.buyer.toLowerCase());
  const editable = viewerIsBuyer && !viewerIsSeller && briefOpenForChange(job, matchPending) && !!job.briefText;

  // "Allow more" on the market note opens this sheet (view 35).
  useEffect(() => {
    const onAsk = (e: Event) => {
      if ((e as CustomEvent<{ jobId?: string }>).detail?.jobId === job.jobId) setOpen(true);
    };
    window.addEventListener(EDIT_REQUEST_EVENT, onAsk);
    return () => window.removeEventListener(EDIT_REQUEST_EVENT, onAsk);
  }, [job.jobId]);

  if (!editable || !callerAddress) return null;

  async function handleSave(patch: {
    briefText?: string;
    negotiationMaxIncreasePct?: number;
    trustedMatch?: boolean;
  }) {
    if (!callerAddress) return;
    setBusy(true);
    setError(null);
    try {
      await api.editBrief(job.jobId, { caller: callerAddress, ...patch });
      await onEdited();
      setOpen(false);
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageCard>
        <div className="px-6 pt-6 pb-3">
          <SectionTag>{es.tag}</SectionTag>
          <h3 className="mt-2 font-sans text-[20px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
            {es.title}
          </h3>
        </div>
        <div className="px-6 pb-6 space-y-3">
          <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
            {es.body}
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
            className="mono text-[14px] uppercase tracking-[0.12em] font-semibold text-[var(--lp-accent-on-light)] underline underline-offset-2 hover:underline-offset-4"
          >
            {es.cta}
          </button>
        </div>
      </PageCard>
      {open && (
        <EditBriefModal
          initialBriefText={job.briefText ?? ''}
          initialTolerancePct={job.negotiationMaxIncreasePct ?? 0}
          initialTrustedMatch={!!job.trustedMatch}
          busy={busy}
          error={error}
          onSave={handleSave}
          onClose={() => {
            setOpen(false);
            setError(null);
          }}
        />
      )}
    </>
  );
}

/// Drawn on the page body: inside the page it sat under the phone's bottom bar,
/// which covered Save changes.
function EditBriefModal(props: Parameters<typeof EditBriefSheet>[0]) {
  return createPortal(<EditBriefSheet {...props} />, document.body);
}

function EditBriefSheet({
  initialBriefText,
  initialTolerancePct,
  initialTrustedMatch,
  busy,
  error,
  onSave,
  onClose,
}: {
  initialBriefText: string;
  initialTolerancePct: number;
  initialTrustedMatch: boolean;
  busy: boolean;
  error: string | null;
  onSave: (patch: {
    briefText?: string;
    negotiationMaxIncreasePct?: number;
    trustedMatch?: boolean;
  }) => void;
  onClose: () => void;
}) {
  const m = useTranslations().liveJob.editModal;
  const [text, setText] = useState(initialBriefText);
  const [tolerancePct, setTolerancePct] = useState(initialTolerancePct);
  const [trustedMatch, setTrustedMatch] = useState(initialTrustedMatch);

  const trimmed = text.trim();
  const textChanged = trimmed !== initialBriefText.trim();
  const toleranceChanged = tolerancePct !== initialTolerancePct;
  const trustedChanged = trustedMatch !== initialTrustedMatch;
  const dirty = textChanged || toleranceChanged || trustedChanged;
  const textValid = trimmed.length >= 5 && trimmed.length <= 2000;
  const toleranceValid = tolerancePct >= 0 && tolerancePct <= 50;
  // Only invalid input blocks the button. Saving with nothing changed just
  // closes the sheet, so it never looks stuck.
  const valid = textValid && toleranceValid;

  function submit() {
    if (!valid || busy) return;
    if (!dirty) {
      onClose();
      return;
    }
    const patch: {
      briefText?: string;
      negotiationMaxIncreasePct?: number;
      trustedMatch?: boolean;
    } = {};
    if (textChanged) patch.briefText = trimmed;
    if (toleranceChanged) patch.negotiationMaxIncreasePct = tolerancePct;
    if (trustedChanged) patch.trustedMatch = trustedMatch;
    onSave(patch);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-stretch sm:justify-end"
      style={{ background: 'rgba(14,14,14,0.55)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="karwan-sheet-enter max-h-[92dvh] w-full overflow-y-auto rounded-t-[22px] sm:h-full sm:max-h-none sm:w-[512px] sm:rounded-none sm:rounded-s-[16px]"
        style={{
          background: 'var(--lp-card)',
          color: 'var(--lp-dark)',
          border: '1px solid var(--lp-border-light)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 pt-6 pb-3">
          <span className="mono text-[13px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {m.tag}
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight">
            {m.title}
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
        </div>
        <div className="px-6 pb-6 space-y-4">
          <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed font-medium">
            {m.body}
          </p>

          <label className="block space-y-1.5">
            <span className="mono text-[13px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              {m.requestTextEyebrow}
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={6}
              className="form-input form-textarea"
              maxLength={2000}
            />
            <span className="mono text-[13px] text-[var(--lp-text-muted)]">
              {text.length}/2000
            </span>
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="mono text-[13px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                {m.toleranceEyebrow}
              </span>
              <span className="font-sans text-[16px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
                +{tolerancePct}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={tolerancePct}
              onChange={(e) => setTolerancePct(Number(e.target.value))}
              disabled={busy}
              className="w-full accent-[var(--lp-accent)]"
              aria-label={m.toleranceAria}
            />
            <p className="mono text-[13px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] leading-snug">
              {m.toleranceFootTemplate.replace('{n}', String(tolerancePct))}
            </p>
          </div>

          <label
            className="flex items-start gap-3 px-4 py-3 cursor-pointer"
            style={{
              background: trustedMatch
                ? 'color-mix(in oklab, var(--lp-accent) 10%, transparent)'
                : 'var(--lp-light)',
              border: trustedMatch
                ? '1px solid color-mix(in oklab, var(--lp-accent) 35%, transparent)'
                : '1px solid var(--lp-border-light)',
              borderRadius: 12,
            }}
          >
            <input
              type="checkbox"
              checked={trustedMatch}
              onChange={(e) => setTrustedMatch(e.target.checked)}
              disabled={busy}
              className="mt-0.5 w-4 h-4 accent-[var(--lp-accent)] shrink-0 cursor-pointer"
            />
            <div className="min-w-0">
              <span
                className="mono text-[13px] font-bold uppercase tracking-[0.16em]"
                style={{ color: trustedMatch ? 'var(--lp-band-dark)' : 'var(--lp-dark)' }}
              >
                {m.trustedMatchEyebrow}
              </span>
              <p className="mt-1.5 text-[14px] leading-snug text-[var(--lp-text-sub)] font-medium">
                {m.trustedMatchBody}
              </p>
            </div>
          </label>

          {error && (
            <p className="mono text-[14px] text-[#b03d3a]">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <CTAPill onClick={submit} disabled={!valid || busy}>
              {busy ? m.saving : m.save}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              {m.cancel}
            </CTAPill>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CancelBriefSection({
  job,
  matchPending,
  viewerIsSeller,
  callerAddress,
  isBuyer,
}: {
  job: BuyerJob;
  matchPending: boolean;
  viewerIsSeller: boolean;
  callerAddress: string | undefined;
  /// The viewer is the buyer who posted this request. `job.buyer` is the
  /// buyer AGENT address, so an address comparison never matches the user.
  isBuyer?: boolean;
}) {
  const cs = useTranslations().liveJob.cancelSection;
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewerIsBuyer =
    isBuyer ?? (!!callerAddress && callerAddress.toLowerCase() === job.buyer.toLowerCase());
  const cancellable = viewerIsBuyer && !viewerIsSeller && briefOpenForChange(job, matchPending);

  if (!cancellable || !callerAddress) return null;

  async function handleCancel() {
    if (!callerAddress) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelBrief(job.jobId, callerAddress);
      router.push('/buyer');
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail);
      setBusy(false);
    }
  }

  return (
    <PageCard>
      <div className="px-6 pt-6 pb-3">
        <SectionTag>{cs.tag}</SectionTag>
        <h3 className="mt-2 font-sans text-[20px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
          {cs.title}
        </h3>
      </div>
      <div className="px-6 pb-6 space-y-3">
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
          {cs.body}
        </p>
        {!confirm ? (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="mono text-[14px] uppercase tracking-[0.12em] font-semibold text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] underline underline-offset-2"
          >
            {cs.cta}
          </button>
        ) : (
          <div
            className="px-4 py-3 space-y-3"
            style={{
              background: 'rgba(176, 61, 58, 0.08)',
              border: '1px solid rgba(176, 61, 58, 0.30)',
              borderRadius: 10,
            }}
          >
            <p className="text-[14px] text-[var(--lp-dark)] leading-snug">
              {cs.confirmBody}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="mono text-[14px] font-bold uppercase tracking-[0.10em] px-3.5 py-2 text-white transition-colors disabled:opacity-60"
                style={{
                  background: '#b03d3a',
                  borderRadius: 8,
                }}
              >
                {busy ? cs.confirmYesBusy : cs.confirmYes}
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                disabled={busy}
                className="mono text-[14px] uppercase tracking-[0.10em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] font-medium"
              >
                {cs.confirmNo}
              </button>
            </div>
            {error && (
              <p className="mono text-[14px] text-[#b03d3a]">{error}</p>
            )}
          </div>
        )}
      </div>
    </PageCard>
  );
}

