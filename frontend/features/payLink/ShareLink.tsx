'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';

/// The link, a copy button, Share, and a QR code for someone standing next to
/// you. On a touch screen Share opens the phone's own share sheet. Desktop
/// browsers report a share sheet that often opens nothing, so there Share opens
/// Karwan's menu of direct links instead (owner, 9 Nov 2026, Figma 226:570).
/// `compact` leaves out the link and the QR when a payment card above already shows them.
export function ShareLink({ url, compact = false }: { url: string; compact?: boolean }) {
  const copy = useTranslations().payLink.create;
  const [copied, setCopied] = useState(false);
  const [nativeShare, setNativeShare] = useState(false);
  useEffect(() => setNativeShare(
    typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches,
  ), []);

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
      <div className={nativeShare ? 'flex flex-col gap-2' : 'flex gap-2.5'}>
        <button type="button" onClick={() => void copyLink()} className={buttonClasses({ size: 'lg', className: nativeShare ? 'w-full' : 'min-w-0 flex-1' })} aria-live="polite">
          {copied ? copy.copied : copy.copy}
        </button>
        {nativeShare ? (
          <button type="button" onClick={() => void navigator.share({ url }).catch((err: unknown) => {
            // Closing the sheet is a choice; anything else falls back to copying the link.
            if ((err as { name?: string })?.name !== 'AbortError') void copyLink();
          })} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>
            {copy.share}
          </button>
        ) : (
          <ShareMenu url={url} />
        )}
      </div>
    </div>
  );
}

type Target = { key: string; label: string; href: string; tint: string; mark: ReactNode };

/// Direct links that open each app with the link ready to send. WhatsApp here is
/// the person's own account; Karwan sends nothing.
export function shareTargets(url: string, message: string, emailLabel: string): Target[] {
  const u = encodeURIComponent(url);
  const m = encodeURIComponent(message);
  const both = encodeURIComponent(`${message} ${url}`);
  return [
    { key: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${m}`, tint: '#2AABEE', mark: <path d="M4 11.5 19 5l-2.6 13.2-4.6-3.6-2.5 2.4.3-3.8L16 7.6l-8.4 5.2L4 11.5Z" fill="currentColor" /> },
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${both}`, tint: '#25D366', mark: <path d="M12 4a8 8 0 0 0-6.9 12L4 20l4.1-1.1A8 8 0 1 0 12 4Zm3.9 10.6c-.2.5-1 .9-1.4.9-.4.1-.8.1-2.7-.7-2.3-1-3.7-3.3-3.8-3.5-.1-.2-.9-1.2-.9-2.3 0-1.1.6-1.6.8-1.8.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4l.7 1.6c.1.1.1.3 0 .4l-.3.5-.3.3c-.1.1-.2.3-.1.5.1.2.6 1 1.3 1.6.9.8 1.6 1 1.8 1.1.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.5-.1l1.5.7c.2.1.4.2.4.3.1.1.1.6-.2 1.4Z" fill="currentColor" /> },
    { key: 'email', label: emailLabel, href: `mailto:?subject=${m}&body=${both}`, tint: '#5C6066', mark: <path d="M5 7h14v10H5V7Zm0 0 7 5.5L19 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /> },
    { key: 'x', label: 'X', href: `https://x.com/intent/tweet?text=${m}&url=${u}`, tint: '#16181A', mark: <path d="M6 5h3.3l3.3 4.6L16.4 5H18l-4.7 5.6L18.6 19h-3.3l-3.6-5-4.2 5H5.9l5.1-6L6 5Z" fill="currentColor" /> },
  ];
}

function ShareMenu({ url }: { url: string }) {
  const copy = useTranslations().payLink.create;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={buttonClasses({ variant: 'secondary', size: 'lg', className: `min-w-[132px] ${open ? 'bg-[var(--raised)]' : ''}` })}
      >
        {copy.share}
        <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open ? (
        <div role="menu" aria-label={copy.shareMenu} className="absolute end-0 top-[calc(100%+8px)] z-30 w-[220px] rounded-[16px] border border-[var(--line)] bg-[var(--raised)] py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          {shareTargets(url, copy.shareMessage, copy.shareEmail).map((t) => (
            <a
              key={t.key}
              role="menuitem"
              data-share-target={t.key}
              href={t.href}
              {...(t.key === 'email' ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center gap-3 px-3.5 text-[15px] font-semibold text-[var(--ink)] outline-none hover:bg-[var(--surface)] focus-visible:bg-[var(--surface)]"
            >
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ background: t.tint }}>
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]">{t.mark}</svg>
              </span>
              {t.label}
            </a>
          ))}
        </div>
      ) : null}
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
