'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useNotifications } from '../hooks/useNotifications';
import { relativeTime } from '@/shared/utils/format';

export function NotificationBell() {
  const { isConnected } = useAccount();
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
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

  const router = useRouter();

  if (!isConnected) return null;

  function toggle() {
    setOpen((s) => {
      const next = !s;
      if (next && unreadCount > 0) {
        // Give the user a beat to see what's unread before clearing the badge.
        setTimeout(markAllRead, 1200);
      }
      return next;
    });
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-md text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 2a3.5 3.5 0 0 0-3.5 3.5c0 2.6-1 3.8-1.4 4.2-.2.2-.3.4-.2.6.1.3.4.4.6.4h9c.3 0 .5-.1.6-.4.1-.2 0-.4-.2-.6-.4-.4-1.4-1.6-1.4-4.2A3.5 3.5 0 0 0 8 2Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M6.5 13a1.7 1.7 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: 'var(--color-critical)', color: '#fff' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card-hover)] z-50 fade-up overflow-hidden"
        >
          <div className="px-4 py-3 flex items-baseline justify-between border-b border-[var(--color-line)]">
            <p className="eyebrow">Notifications</p>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[12px] text-[var(--color-ink-dim)]">Nothing yet.</p>
              <p className="text-[11px] text-[var(--color-ink-faint)] mt-1">
                Deal updates land here as they happen.
              </p>
            </div>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto divide-y divide-[var(--color-line)]">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                      router.push(`/deals/${n.jobId}`);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors flex items-start gap-2.5"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        background: n.read ? 'var(--color-line-strong)' : 'var(--color-accent)',
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[12px] leading-snug ${
                          n.read ? 'text-[var(--color-ink-dim)]' : 'text-[var(--color-ink)] font-medium'
                        }`}
                      >
                        {n.summary}
                      </span>
                      <span className="block text-[10px] mono text-[var(--color-ink-faint)] mt-0.5">
                        {relativeTime(n.ts)}
                      </span>
                    </span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden
                      className="text-[var(--color-ink-faint)] mt-1 shrink-0"
                    >
                      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
