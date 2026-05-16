'use client';
import type { ReactNode } from 'react';
import { useTelegramLink } from '../hooks/useTelegramLink';

const CARD_STYLE = {
  background: 'var(--lp-card)',
  border: '1px solid var(--lp-border-light)',
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  borderBottomLeftRadius: 22,
  borderBottomRightRadius: 5,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
} as const;

function Note({ tone, children }: { tone: 'info' | 'error'; children: ReactNode }) {
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

export function TelegramConnectCard({ address }: { address?: string }) {
  const { status, loading, linking, deepLink, startLink, cancelLink, unlink, error } =
    useTelegramLink(address);

  return (
    <section style={CARD_STYLE} className="p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:TELEGRAM ALERTS:]
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none">
            Push to your chat
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
          <p className="mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            Deals · chat · bridge state
          </p>
        </div>
        {status?.linked && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 mono text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{
              background: 'rgba(10,117,83,0.10)',
              color: '#0a7553',
              border: '1px solid rgba(10,117,83,0.30)',
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 2,
            }}
          >
            <span
              aria-hidden
              data-instrument-blink
              className="inline-block w-[6px] h-[6px]"
              style={{
                background: '#0a7553',
                animation: 'instrumentBlink 1.6s ease-in-out infinite',
              }}
            />
            LINKED
          </span>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {loading && !status && (
          <div className="h-10 w-2/3 bg-black/[0.05] animate-pulse motion-reduce:animate-none rounded" />
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
            <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
              One tap to open the bot, one more to confirm. Wallet stays in your browser.
            </p>
            <button
              type="button"
              onClick={startLink}
              className="inline-flex items-center gap-2 px-5 py-3 mono text-[13px] font-bold uppercase tracking-[0.08em] transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0"
              style={{
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 4,
                boxShadow: '0 4px 0 rgba(0,0,0,0.22)',
              }}
            >
              Connect Telegram
              <span aria-hidden>→</span>
            </button>
          </>
        )}

        {status?.enabled && !status.linked && linking && deepLink && (
          <>
            <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
              Open the bot in Telegram and tap{' '}
              <span className="font-semibold text-[var(--lp-dark)]">Start</span>. Karwan confirms
              automatically.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 mono text-[13px] font-bold uppercase tracking-[0.08em] transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0"
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
              <button
                type="button"
                onClick={cancelLink}
                className="px-3 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-light)] transition-colors rounded"
              >
                Cancel
              </button>
            </div>
            <Note tone="info">
              <p className="font-bold uppercase tracking-[0.08em] text-[10px]">
                Waiting for /start
              </p>
              <p className="mt-1 text-[11.5px] opacity-90 normal-case">
                Link expires in 10 minutes.
              </p>
            </Note>
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
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={unlink}
                className="px-3 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[#b03d3a] hover:bg-[rgba(176,61,58,0.07)] transition-colors rounded"
              >
                Unlink
              </button>
              <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                Email alerts coming later
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
