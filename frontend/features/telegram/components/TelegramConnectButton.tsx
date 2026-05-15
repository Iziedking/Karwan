'use client';
import { useState } from 'react';
import { Note } from '@/shared/components/AppUI';
import { useTelegramLink } from '../hooks/useTelegramLink';

const TG_BLUE = '#229ED9';

function TelegramGlyph({ size = 14 }: { size?: number }) {
  // Paper-plane silhouette inside the Telegram-blue tile. Flat fill, no
  // gradient — fits the rest of the brand chips on the dark header.
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

/// Inline header affordance for Telegram pairing. Sits next to ConnectX; opens
/// the link modal on click and morphs into a "@username" chip once linked.
export function TelegramConnectButton({ address }: { address?: string }) {
  const link = useTelegramLink(address);
  const [open, setOpen] = useState(false);

  // Auto-close after a successful link (small delight + matches the modal flow).
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
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[12px] font-semibold tracking-tight border border-white/20 text-white/60 cursor-not-allowed w-fit"
      >
        <TelegramGlyph />
        Telegram
        <span className="text-[9px] uppercase tracking-[0.1em] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/55">
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
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[12px] font-semibold tracking-tight border border-white/20 text-white hover:bg-white/[0.08] hover:border-white/35 transition-colors w-fit"
      >
        <TelegramGlyph />
        {linkedLabel ?? 'Connect Telegram'}
        {linkedLabel && (
          <span
            className="text-[9px] uppercase tracking-[0.1em] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(212,255,63,0.18)', color: 'var(--lp-accent)' }}
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

function TelegramConnectModal({
  link,
  onClose,
}: {
  link: ReturnType<typeof useTelegramLink>;
  onClose: () => void;
}) {
  const { status, linking, deepLink, startLink, unlink, error } = link;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklab, var(--lp-dark) 55%, transparent)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[24px] bg-[var(--lp-card)] text-[var(--lp-dark)] overflow-hidden fade-up"
      >
        <div className="px-6 pt-6 pb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <TelegramGlyph size={16} />
            <h2 className="font-sans text-[20px] font-bold tracking-[-0.02em]">Telegram alerts</h2>
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
          <p className="mono text-[12px] text-[var(--lp-text-sub)]">
            deal updates · chat messages · bridge state, pushed to your chat
          </p>

          {!status?.linked && !linking && (
            <>
              <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
                Connect your Telegram so deal updates and incoming chat messages reach you outside
                the app. One tap to open the bot, one more to confirm.
              </p>
              <button
                type="button"
                onClick={startLink}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--lp-accent)] text-[var(--lp-dark)] px-5 py-3 text-[13px] font-semibold transition-all duration-200 hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5"
              >
                Generate link
                <span aria-hidden>→</span>
              </button>
            </>
          )}

          {!status?.linked && linking && deepLink && (
            <>
              <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
                Open the bot in Telegram and tap{' '}
                <span className="font-semibold text-[var(--lp-dark)]">Start</span>. Karwan will
                confirm the link automatically.
              </p>
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--lp-accent)] text-[var(--lp-dark)] px-5 py-3 text-[13px] font-semibold transition-all duration-200 hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5"
              >
                Open Telegram
                <span aria-hidden>↗</span>
              </a>
              <Note tone="info">
                <p className="font-medium">Waiting for the /start tap…</p>
                <p className="text-[11px] opacity-90">
                  This link expires in 10 minutes. Generate a fresh one if you don&apos;t use it.
                </p>
              </Note>
            </>
          )}

          {status?.linked && (
            <>
              <div className="rounded-[14px] bg-[var(--lp-light)] px-4 py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div>
                  <p className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)]">
                    Telegram
                  </p>
                  <p className="font-sans text-[15px] font-semibold tracking-[-0.01em]">
                    {status.username ? `@${status.username}` : `chat ${status.chatId ?? ''}`}
                  </p>
                </div>
                {status.linkedAt && (
                  <p className="mono text-[11px] text-[var(--lp-text-sub)]">
                    linked {formatLinkedAt(status.linkedAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={unlink}
                  className="px-4 py-2 rounded-full text-[12px] font-medium text-[var(--lp-text-sub)] hover:text-[#b91c1c] hover:bg-[rgba(185,28,28,0.07)] transition-colors"
                >
                  Unlink
                </button>
              </div>
            </>
          )}

          {error && <Note tone="error">{error}</Note>}
        </div>
      </div>
    </div>
  );
}

function formatLinkedAt(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
