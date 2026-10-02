'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

const QUIET =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';

/// The link, a copy button, the phone's share sheet when there is one, and a QR
/// code for someone standing next to you.
export function ShareLink({ url }: { url: string }) {
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
    <div className="space-y-4">
      <p className="break-all rounded-[14px] bg-[var(--lp-light)] px-4 py-3 text-[14px] text-[var(--lp-dark)]">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyLink()} className={QUIET} aria-live="polite">
          {copied ? copy.copied : copy.copy}
        </button>
        {canShare ? (
          <button type="button" onClick={() => void navigator.share({ url }).catch(() => {})} className={QUIET}>
            {copy.share}
          </button>
        ) : null}
      </div>
      <PayLinkQr value={url} label={copy.qrAlt} />
    </div>
  );
}

export function PayLinkQr({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const QR = await import('qrcode');
        if (cancelled || !ref.current || !value) return;
        await QR.toCanvas(ref.current, value, { margin: 1, width: 180, errorCorrectionLevel: 'M', color: { dark: '#0A0A0BFF', light: '#FFFFFFFF' } });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (failed || !value) return null;
  return (
    <div className="inline-block rounded-[16px] border border-[var(--lp-border-light)] bg-white p-3">
      <canvas ref={ref} aria-label={label} role="img" width={180} height={180} />
    </div>
  );
}
