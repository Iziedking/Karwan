'use client';

import { useEffect, useRef, useState } from 'react';

export type InviteLinkToolsCopy = {
  shareCta: string;
  copyCta: string;
  copied: string;
  shared: string;
  failed: string;
  qrCta: string;
  qrLoading: string;
  qrUnavailable: string;
  qrAlt: string;
};

type ShareState = 'idle' | 'copied' | 'shared' | 'failed';

/// A link-only share surface for direct deals. It is deliberately ignorant of
/// deal terms and money so it can be used in both the public preview and the
/// authenticated pending-deal panel.
export function InviteLinkTools({
  url,
  copy,
  className,
}: {
  url: string;
  copy: InviteLinkToolsCopy;
  className?: string;
}) {
  const [shareState, setShareState] = useState<ShareState>('idle');
  const [qrOpen, setQrOpen] = useState(false);

  async function copyLink() {
    try {
      await writeLinkToClipboard(url);
      setShareState('copied');
    } catch {
      setShareState('failed');
    }
  }

  async function shareLink() {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Karwan deal invite', url });
        setShareState('shared');
        return;
      }
      await writeLinkToClipboard(url);
      setShareState('copied');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareState('failed');
    }
  }

  const status =
    shareState === 'copied'
      ? copy.copied
      : shareState === 'shared'
        ? copy.shared
        : shareState === 'failed'
          ? copy.failed
          : null;

  return (
    <div className={className ?? 'space-y-2'}>
      <div className="grid grid-cols-1 gap-2 sm:flex sm:items-stretch">
        <input
          type="text"
          value={url}
          readOnly
          aria-label={copy.qrAlt}
          className="min-h-11 min-w-0 flex-1 bg-[var(--lp-workspace-raised)] border border-[var(--lp-workspace-border)] rounded-[3px] px-2.5 py-2 text-[12px] mono text-[var(--lp-workspace-ink)]"
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            onClick={shareLink}
            className="min-h-11 px-3 py-2 mono text-[10px] font-bold uppercase tracking-[0.1em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
            style={cornerStyle}
          >
            {copy.shareCta}
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="min-h-11 px-3 py-2 mono text-[10px] font-bold uppercase tracking-[0.1em] border border-[var(--lp-workspace-border)] text-[var(--lp-workspace-ink)] hover:border-[var(--lp-accent)] transition-colors"
            style={cornerStyle}
          >
            {copyCtaLabel(shareState, copy)}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          aria-expanded={qrOpen}
          onClick={() => setQrOpen((open) => !open)}
          className="min-h-11 px-2 py-2 mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-workspace-muted)] underline underline-offset-2 hover:text-[var(--lp-workspace-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lp-accent)]"
        >
          {copy.qrCta}
        </button>
        {status && (
          <span role={shareState === 'failed' ? 'alert' : 'status'} className="text-[12px] text-[var(--lp-workspace-muted)]">
            {status}
          </span>
        )}
      </div>

      {qrOpen && <InviteQr value={url} copy={copy} />}
    </div>
  );
}

const cornerStyle = {
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
  borderBottomLeftRadius: 8,
  borderBottomRightRadius: 2,
} as const;

function copyCtaLabel(state: ShareState, copy: InviteLinkToolsCopy): string {
  return state === 'copied' ? copy.copied : copy.copyCta;
}

async function writeLinkToClipboard(value: string): Promise<void> {
  if (typeof window === 'undefined') throw new Error('clipboard unavailable');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('copy rejected');
  } finally {
    document.body.removeChild(textarea);
  }
}

function InviteQr({ value, copy }: { value: string; copy: InviteLinkToolsCopy }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const QR = await import('qrcode');
        if (cancelled || !canvasRef.current) return;
        await QR.toCanvas(canvasRef.current, value, {
          margin: 1,
          width: 184,
          errorCorrectionLevel: 'M',
          color: { dark: '#0A0A0BFF', light: '#FFFFFFFF' },
        });
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (state === 'failed') {
    return <p className="text-[12px] text-[var(--lp-workspace-muted)]">{copy.qrUnavailable}</p>;
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-white w-fit" style={cornerStyle}>
      {state === 'loading' && (
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-black">{copy.qrLoading}</span>
      )}
      <canvas
        ref={canvasRef}
        aria-label={copy.qrAlt}
        role="img"
        width={184}
        height={184}
        className={state === 'loading' ? 'hidden' : 'block'}
      />
    </div>
  );
}
