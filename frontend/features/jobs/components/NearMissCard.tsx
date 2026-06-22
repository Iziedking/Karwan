'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type NearMissApproval } from '@/core/api';
import { formatUsdc } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

interface Props {
  nearMiss: NearMissApproval;
  onChange: () => void;
}

function remainingLabel(
  expiresAt: number,
  now: number,
  copy: Messages['nearMissCard'],
): string {
  const ms = expiresAt - now;
  if (ms <= 0) return copy.remainingExpired;
  const mins = Math.floor(ms / 60_000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0
      ? copy.remainingHrMin.replace('{h}', String(h)).replace('{m}', String(m))
      : copy.remainingHr.replace('{h}', String(h));
  }
  if (mins >= 1) return copy.remainingMin.replace('{m}', String(mins));
  return copy.remainingSec.replace('{s}', String(Math.max(1, Math.floor(ms / 1000))));
}

/// The agent found a real match, but the price sits just outside one party's
/// range. Rather than walking away, it asks that party to proceed. The asked
/// party gets Proceed / Pass; the other party sees a waiting note.
export function NearMissCard({ nearMiss, onChange }: Props) {
  const nm = useTranslations().nearMissCard;
  const router = useRouter();
  const { address } = useAuth();
  const [busy, setBusy] = useState<'proceed' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const me = address?.toLowerCase();
  const viewerIsAsked = !!me && me === nearMiss.askedUser.toLowerCase();
  const askedSeller = nearMiss.askedSide === 'seller';
  // Below floor (seller asked) reads in navy; above cap (buyer asked) in amber.
  const rail = askedSeller ? '#3a4a85' : '#b07d1f';

  async function onProceed() {
    if (!address) return;
    setBusy('proceed');
    setError(null);
    try {
      await api.proceedNearMiss(nearMiss.jobId, address);
      onChange();
      router.push(`/deals/${nearMiss.jobId}`);
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onDecline() {
    if (!address) return;
    setBusy('decline');
    setError(null);
    try {
      await api.declineNearMiss(nearMiss.jobId, address);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const gapStr = formatUsdc(nearMiss.gapUsdc, { withSuffix: true });
  const limitStr = formatUsdc(nearMiss.limitUsdc, { withSuffix: true });
  const directionLine = (askedSeller ? nm.directionBelowFloor : nm.directionAboveCap)
    .replace('{gap}', gapStr)
    .replace('{limit}', limitStr);

  return (
    <div
      className="relative flex items-stretch border bg-[var(--color-surface)] fade-up"
      style={{ borderColor: 'var(--color-line-strong)', borderRadius: 3 }}
    >
      <span aria-hidden className="w-[3px]" style={{ background: rail }} />
      <div className="flex-1 px-5 py-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="mono uppercase font-semibold text-[9px] tracking-[0.22em]" style={{ color: rail }}>
            {nm.eyebrow}
          </p>
          <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)] tabular-nums">
            {remainingLabel(nearMiss.expiresAt, now, nm)}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span
            className="serif text-[38px] tabular-nums leading-none tracking-[-0.02em]"
            style={{ color: 'var(--color-ink)' }}
          >
            {formatUsdc(nearMiss.proceedPriceUsdc, { withSuffix: false })}
          </span>
          <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
            USDC
          </span>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
          {viewerIsAsked
            ? nm.askedBodyTemplate.replace('{direction}', directionLine)
            : askedSeller
              ? nm.otherBodySellerTemplate
              : nm.otherBodyBuyerTemplate}
        </p>

        {(nearMiss.marketFairPriceUsdc != null || nearMiss.marketNote) && (
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
            <span className="mono uppercase tracking-[0.12em] text-[10px]" style={{ color: rail }}>
              market check ·{' '}
            </span>
            {nearMiss.marketFairPriceUsdc != null && (
              <>about ${nearMiss.marketFairPriceUsdc.toFixed(0)} in the market</>
            )}
            {nearMiss.marketDemand && <> · demand {nearMiss.marketDemand}</>}
            {nearMiss.marketNote ? `. ${nearMiss.marketNote}` : '.'}
          </p>
        )}

        {viewerIsAsked && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onProceed}
              disabled={busy !== null}
              style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-surface)' }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-wait transition-opacity"
            >
              {busy === 'proceed' && <Spinner />}
              {busy === 'proceed' ? nm.proceedBusy : nm.proceedCta}
            </button>
            <button
              type="button"
              onClick={onDecline}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-medium border transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-50"
              style={{ borderColor: 'var(--color-line-strong)', color: 'var(--color-ink-dim)' }}
            >
              {busy === 'decline' && <Spinner />}
              {busy === 'decline' ? nm.declineBusy : nm.declineCta}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-[11px] mono text-[var(--color-critical)]">{error}</p>}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
