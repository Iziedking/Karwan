'use client';
import { Note } from '@/shared/components/AppUI';
import { useTelegramLink } from '../hooks/useTelegramLink';

/// Profile widget for pairing a Telegram chat with the connected wallet. Once
/// linked, the backend bot pushes deal updates, chat messages, and bridge
/// state changes to that chat.
export function TelegramConnectCard({ address }: { address?: string }) {
  const { status, loading, linking, deepLink, startLink, cancelLink, unlink, error } =
    useTelegramLink(address);

  return (
    <section className="rounded-[28px] bg-[var(--lp-card)] text-[var(--lp-dark)] p-7 md:p-9">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-sans text-[22px] md:text-[24px] font-bold tracking-[-0.02em]">
            Telegram alerts
          </h2>
          <p className="mt-1 mono text-[12px] text-[var(--lp-text-sub)]">
            deal updates · chat messages · bridge state, pushed to your chat
          </p>
        </div>
        {status?.linked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lp-light)] px-2.5 py-1 text-[11px] font-medium text-[var(--lp-dark)] shrink-0">
            <span className="size-1.5 rounded-full bg-[#15803d]" />
            linked
          </span>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {loading && !status && (
          <div className="h-10 w-2/3 rounded-[12px] bg-black/[0.05] animate-pulse" />
        )}

        {status && !status.enabled && (
          <Note tone="info">
            Telegram alerts are not configured on this server. Ask the operator to set{' '}
            <span className="mono">TELEGRAM_BOT_TOKEN</span> and{' '}
            <span className="mono">TELEGRAM_BOT_USERNAME</span>.
          </Note>
        )}

        {status?.enabled && !status.linked && !linking && (
          <>
            <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
              Connect your Telegram so deal updates and incoming chat messages reach you outside
              the app. One tap to open the bot, one more to confirm — your wallet stays in your
              browser.
            </p>
            <button
              type="button"
              onClick={startLink}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--lp-accent)] text-[var(--lp-dark)] px-5 py-3 text-[13px] font-semibold transition-all duration-200 hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5"
            >
              Connect Telegram
              <span aria-hidden>→</span>
            </button>
          </>
        )}

        {status?.enabled && !status.linked && linking && deepLink && (
          <>
            <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
              Open the bot in Telegram and tap <span className="font-semibold text-[var(--lp-dark)]">Start</span>.
              Karwan will confirm the link automatically.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--lp-accent)] text-[var(--lp-dark)] px-5 py-3 text-[13px] font-semibold transition-all duration-200 hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5"
              >
                Open Telegram
                <span aria-hidden>↗</span>
              </a>
              <button
                type="button"
                onClick={cancelLink}
                className="px-4 py-2.5 rounded-full text-[12px] font-medium text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-light)] transition-colors"
              >
                Cancel
              </button>
            </div>
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
                <p className="font-sans text-[14px] font-semibold tracking-[-0.01em]">
                  {status.username ? `@${status.username}` : `chat ${status.chatId ?? ''}`}
                </p>
              </div>
              {status.linkedAt && (
                <p className="mono text-[11px] text-[var(--lp-text-sub)]">
                  linked {formatLinkedAt(status.linkedAt)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={unlink}
                className="px-4 py-2 rounded-full text-[12px] font-medium text-[var(--lp-text-sub)] hover:text-[#b91c1c] hover:bg-[rgba(185,28,28,0.07)] transition-colors"
              >
                Unlink
              </button>
              <p className="text-[11px] text-[var(--lp-text-muted)]">
                Email alerts are coming in a later release.
              </p>
            </div>
          </>
        )}

        {error && <Note tone="error">{error}</Note>}
      </div>
    </section>
  );
}

function formatLinkedAt(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
