'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { relativeTime } from '@/shared/utils/format';

export function NotificationBell() {
  const { isAuthenticated: isConnected } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Panel renders via portal so a transformed ancestor (.fade-up bands) cannot
  // trap its position:fixed. Track the panel node separately so the
  // outside-click handler doesn't treat in-panel clicks as outside.
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (
        (wrapRef.current && wrapRef.current.contains(target)) ||
        (panelRef.current && panelRef.current.contains(target))
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isConnected) return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 2a3.5 3.5 0 0 0-3.5 3.5c0 2.6-1 3.8-1.4 4.2-.2.2-.3.4-.2.6.1.3.4.4.6.4h9c.3 0 .5-.1.6-.4.1-.2 0-.4-.2-.6-.4-.4-1.4-1.6-1.4-4.2A3.5 3.5 0 0 0 8 2Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M6.5 13a1.7 1.7 0 0 0 3 0"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -end-0.5 min-w-[14px] h-[14px] px-1 rounded-full mono text-[9px] font-bold flex items-center justify-center text-[var(--lp-dark)]"
            style={{ background: 'var(--lp-accent)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="fixed start-2 end-2 top-[60px] sm:start-auto sm:end-3 sm:w-[340px] max-w-[calc(100vw-1rem)] bg-[var(--lp-card)] z-[60] fade-up overflow-hidden"
          style={{
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 4,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.22)',
            color: 'var(--lp-dark)',
          }}
        >
          <div
            className="px-4 py-3 flex items-baseline justify-between"
            style={{ borderBottom: '1px solid var(--lp-border-light)' }}
          >
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:NOTIFICATIONS:]
            </span>
            {notifications.length > 0 && (
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
                  >
                    Mark read
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearAll}
                  className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center space-y-1.5">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                NOTHING YET
              </p>
              <p className="text-[12px] text-[var(--lp-text-sub)] leading-snug max-w-[28ch] mx-auto">
                Deal matches, escrow events, and cancellation proposals land here as they happen.
              </p>
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-[var(--lp-border-light)]">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                      router.push(n.href);
                    }}
                    className="w-full text-start px-4 py-3 hover:bg-[var(--lp-light)] transition-colors flex items-start gap-3"
                  >
                    <span
                      aria-hidden
                      className="mt-[5px] shrink-0 inline-block w-[6px] h-[6px]"
                      style={{
                        background: n.read ? 'rgba(0,0,0,0.18)' : 'var(--lp-accent)',
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[12.5px] leading-snug ${
                          n.read
                            ? 'text-[var(--lp-text-sub)]'
                            : 'text-[var(--lp-dark)] font-medium'
                        }`}
                      >
                        {n.summary}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                          {relativeTime(n.ts)}
                        </span>
                        <span aria-hidden className="text-[var(--lp-text-muted)]">·</span>
                        <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] tabular-nums">
                          {n.jobId.slice(0, 6)}…{n.jobId.slice(-4)}
                        </span>
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mt-1 shrink-0"
                    >
                      OPEN →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
