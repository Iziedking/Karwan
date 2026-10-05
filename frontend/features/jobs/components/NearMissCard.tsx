'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type NearMissApproval } from '@/core/api';
import { formatUsdc } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';
import { buttonClasses } from '@/shared/components/Button';

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
  // The dot says whose call it is: navy when the seller is asked, amber when the buyer is.
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
    <section className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-5 py-4 fade-up">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--lp-text-sub)]">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: rail }} />
          {nm.eyebrow}
        </p>
        <span className="shrink-0 text-[14px] tabular-nums text-[var(--lp-text-muted)]">
          {remainingLabel(nearMiss.expiresAt, now, nm)}
        </span>
      </div>

      <p className="mt-3 text-[34px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
        {formatUsdc(nearMiss.proceedPriceUsdc, { withSuffix: false })}
        <span className="ms-1.5 text-[15px] font-medium tracking-normal text-[var(--lp-text-sub)]">USDC</span>
      </p>

      <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
        {viewerIsAsked
          ? nm.askedBodyTemplate.replace('{direction}', directionLine)
          : askedSeller
            ? nm.otherBodySellerTemplate
            : nm.otherBodyBuyerTemplate}
      </p>

      {viewerIsAsked && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onProceed}
            disabled={busy !== null}
            className={buttonClasses({ className: 'rounded-full px-5' })}
          >
            {busy === 'proceed' && <Spinner />}
            {busy === 'proceed' ? nm.proceedBusy : nm.proceedCta}
          </button>
          <button
            type="button"
            onClick={onDecline}
            disabled={busy !== null}
            className={buttonClasses({ variant: 'outline', className: 'rounded-full px-5' })}
          >
            {busy === 'decline' && <Spinner />}
            {busy === 'decline' ? nm.declineBusy : nm.declineCta}
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-[14px] text-[var(--color-critical)]">{error}</p>}
    </section>
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
