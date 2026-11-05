'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';

/// The link, a copy button, the phone's share sheet when there is one, and a QR
/// code for someone standing next to you.
/// `compact` leaves out the link and the QR when a payment card above already shows them.
export function ShareLink({ url, compact = false }: { url: string; compact?: boolean }) {
  const copy = useTranslations().payLink.create;
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // The link stays on screen and selectable.
    }
  }

  return (
    <div className="space-y-5">
      {compact ? null : <p className={`${CARD_CLASS} break-all px-5 py-4 text-[15px] text-[var(--ink)] select-all`}>{url}</p>}
      {compact ? null : <PayLinkQr value={url} label={copy.qrAlt} />}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => void copyLink()} className={buttonClasses({ size: 'lg', className: 'w-full' })} aria-live="polite">
          {copied ? copy.copied : copy.copy}
        </button>
        {canShare ? (
          <button type="button" onClick={() => void navigator.share({ url }).catch(() => {})} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>
            {copy.share}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function PayLinkQr({ value, label, size = 180 }: { value: string; label: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const QR = await import('qrcode');
        if (cancelled || !ref.current || !value) return;
        await QR.toCanvas(ref.current, value, { margin: 1, width: size, errorCorrectionLevel: 'M', color: { dark: '#0A0A0BFF', light: '#FFFFFFFF' } });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, size]);
  if (failed || !value) return null;
  return (
    <div className={`inline-block shrink-0 border border-[var(--line)] bg-white ${size < 120 ? 'rounded-[10px] p-1.5' : 'rounded-[var(--radius-card)] p-3'}`}>
      <canvas ref={ref} aria-label={label} role="img" width={size} height={size} />
    </div>
  );
}
