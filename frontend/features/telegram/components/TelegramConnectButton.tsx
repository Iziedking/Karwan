'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTelegramLink } from '../hooks/useTelegramLink';

const TG_BLUE = '#229ED9';

function TelegramGlyph({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-[5px] shrink-0"
      style={{ background: TG_BLUE, width: size + 4, height: size + 4 }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3.5 10.6L20 4.2c.9-.3 1.7.5 1.4 1.4l-3.1 13.7c-.2 1-1.3 1.2-2 .5l-4.4-4-2.4 2.3c-.4.4-1 .2-1.1-.4l-.9-3.8L3 12.3c-.7-.3-.7-1.3.5-1.7z"
          fill="#fff"
        />
        <path
          d="M9.6 14.7l8-7.4c.2-.2-.1-.5-.4-.3l-9.7 5.9"
          stroke={TG_BLUE}
          strokeWidth="0.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function TelegramConnectButton({
  address,
  tone = 'dark',
}: {
  address?: string;
  tone?: 'dark' | 'light';
}) {
  const link = useTelegramLink(address);
  const [open, setOpen] = useState(false);

  // Theme-aware tokens. `dark` keeps the original white-on-dark chip; `light`
  // flips to black-on-white so the chip stays legible inside a `Band tone="light"`.
  const onLight = tone === 'light';
  const chipClass = onLight
    ? 'border-black/15 text-[var(--lp-band-dark)] hover:bg-black/[0.04] hover:border-black/30'
    : 'border-white/20 text-white hover:bg-white/[0.08] hover:border-white/35';
  const chipMuted = onLight
    ? 'border-black/12 text-black/55'
    : 'border-white/20 text-white/60';
  const offPillClass = onLight
    ? 'bg-black/[0.06] text-black/55'
    : 'bg-white/[0.08] text-white/55';

  const linkedLabel = link.status?.linked
    ? link.status.username
      ? `@${link.status.username}`
      : `chat ${link.status.chatId ?? ''}`
    : null;

  if (link.status && !link.status.enabled) {
    return (
      <button
        type="button"
        disabled
        title="Telegram alerts are not configured on this server"
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] border ${chipMuted} cursor-not-allowed w-fit`}
        style={{
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 2,
        }}
      >
        <TelegramGlyph />
        Telegram
        <span className={`text-[9px] uppercase tracking-[0.12em] font-bold px-1.5 py-0.5 ${offPillClass} rounded-sm`}>
          Off
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={linkedLabel ? `Manage Telegram link (${linkedLabel})` : 'Connect Telegram for alerts'}
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] border ${chipClass} transition-colors w-fit`}
        style={{
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 2,
        }}
      >
        <TelegramGlyph />
        {linkedLabel ?? 'Connect Telegram'}
        {linkedLabel && (
          <span
            className="text-[9px] uppercase tracking-[0.12em] font-bold px-1.5 py-0.5"
            style={{
              background: 'rgba(189, 225, 34,0.18)',
              color: 'var(--lp-accent)',
              borderRadius: 3,
            }}
          >
            Linked
          </span>
        )}
      </button>

      {open && (
        <TelegramConnectModal
          link={link}
          onClose={() => {
            link.cancelLink();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ModalNote({ tone, children }: { tone: 'info' | 'error'; children: ReactNode }) {
  const style =
    tone === 'error'
      ? {
          background: 'rgba(176,61,58,0.10)',
          color: '#b03d3a',
          border: '1px solid rgba(176,61,58,0.35)',
        }
      : {
          background: 'rgba(189, 225, 34,0.10)',
          color: 'var(--lp-dark)',
          border: '1px solid rgba(189, 225, 34,0.30)',
        };
  return (
    <div
      className="px-3 py-2.5 text-[12.5px] leading-snug"
      style={{
        ...style,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
      }}
    >
      {children}
    </div>
  );
}

function TelegramConnectModal({
  link,
  onClose,
}: {
  link: ReturnType<typeof useTelegramLink>;
  onClose: () => void;
}) {
  const { status, linking, deepLink, startLink, unlink, error } = link;
  // Portal to <body>: a `position: fixed` modal is contained by any ancestor
  // with a transform, and the profile bands animate with `.fade-up` (ends at
  // translateY(0), still a transform). Without the portal the modal anchors to
  // a band instead of the viewport, so it renders mid-content and clips the
  // post-"Generate link" state below the fold. Mounted guard keeps SSR happy.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(14,14,14,0.55)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md my-auto max-h-[90vh] overflow-y-auto bg-[var(--lp-card)] text-[var(--lp-dark)] fade-up"
        style={{
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <TelegramGlyph size={16} />
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                [:TELEGRAM ALERTS:]
              </span>
            </div>
            <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none">
              Push to your chat
              <span style={{ color: 'var(--lp-accent)' }}>.</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="size-8 inline-flex items-center justify-center rounded-full text-[var(--lp-text-sub)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            Deals · chat · bridge state
          </p>

          {!status?.linked && !linking && (
            <>
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                One tap to open the bot, one more to confirm. Deal updates and chat messages reach
                you outside the app.
              </p>
              <button
                type="button"
                onClick={startLink}
                className="inline-flex w-full items-center justify-center gap-2 px-5 py-3 mono text-[13px] font-bold uppercase tracking-[0.08em] transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  borderBottomLeftRadius: 14,
                  borderBottomRightRadius: 4,
                  boxShadow: '0 4px 0 rgba(0,0,0,0.22)',
                }}
              >
                Generate link
                <span aria-hidden>→</span>
              </button>
            </>
          )}

          {!status?.linked && linking && deepLink && (
            <>
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                Open the bot in Telegram and tap{' '}
                <span className="font-semibold text-[var(--lp-dark)]">Start</span>. Karwan
                confirms the link automatically.
              </p>
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 px-5 py-3 mono text-[13px] font-bold uppercase tracking-[0.08em] transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  borderBottomLeftRadius: 14,
                  borderBottomRightRadius: 4,
                  boxShadow: '0 4px 0 rgba(0,0,0,0.22)',
                }}
              >
                Open Telegram
                <span aria-hidden>↗</span>
              </a>
              <ModalNote tone="info">
                <p className="font-bold uppercase tracking-[0.08em] text-[10px]">
                  Waiting for /start
                </p>
                <p className="mt-1 text-[11.5px] opacity-90 normal-case">
                  Link expires in 10 minutes. Generate a fresh one if you don&apos;t use it.
                </p>
              </ModalNote>
            </>
          )}

          {status?.linked && (
            <>
              <div
                className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                style={{
                  background: 'var(--lp-light)',
                  border: '1px solid var(--lp-border-light)',
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 3,
                }}
              >
                <div>
                  <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    Telegram
                  </p>
                  <p className="mt-1 font-sans text-[16px] font-extrabold tracking-[-0.01em]">
                    {status.username ? `@${status.username}` : `chat ${status.chatId ?? ''}`}
                  </p>
                </div>
                {status.linkedAt && (
                  <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                    linked {formatLinkedAt(status.linkedAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={unlink}
                  className="px-3 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[#b03d3a] hover:bg-[rgba(176,61,58,0.07)] transition-colors rounded"
                >
                  Unlink
                </button>
              </div>
            </>
          )}

          {error && <ModalNote tone="error">{error}</ModalNote>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatLinkedAt(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
