'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { Icon } from '@/shared/components/Icon';
import { useNotifications, type AppNotification } from '../hooks/useNotifications';
import { safeNotificationHref } from '../notificationRouting';
import { relativeTime } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { requestPageRefresh } from '@/shared/utils/pageRefresh';
import { KindIcon } from './KindIcon';

export function NotificationBell() {
  const { isAuthenticated: isConnected } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const t = useTranslations().notifications.bell;
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
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
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

  function openItem(n: AppNotification) {
    markRead(n.id);
    setOpen(false);
    const href = safeNotificationHref(n);
    // Already on that page: navigating to it changes nothing, so ask the page
    // to read its data again.
    if (href.split('#')[0] === window.location.pathname) requestPageRefresh();
    router.push(href);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label={unreadCount > 0 ? `${t.aria}, ${unreadCount} unread` : t.aria}
        aria-expanded={open}
        className="relative inline-flex size-9 items-center justify-center rounded-full text-[var(--color-ink-dim)] before:absolute before:-inset-1 before:content-[''] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        <Icon name="bell" size={20} />
        {unreadCount > 0 ? (
          <span
            aria-hidden
            className="absolute -end-0.5 -top-0.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--lp-accent)] px-1 text-[13px] font-bold tabular-nums leading-none text-[var(--accent-ink)]"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={t.sectionTag}
              className="fade-up fixed end-2 start-2 top-[64px] z-[60] flex max-h-[min(72dvh,560px)] flex-col overflow-hidden rounded-[22px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] sm:start-auto sm:end-4 sm:w-[400px]"
              style={{ boxShadow: 'var(--product-panel-shadow, 0 18px 48px -24px rgba(0,0,0,0.35))' }}
            >
              <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{t.sectionTag}</h2>
                {unreadCount > 0 ? (
                  <button type="button" onClick={markAllRead} className="-me-2 min-h-11 rounded-full px-3 text-[14px] font-semibold text-[var(--lp-text-sub)] transition-colors hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
                    {t.markRead}
                  </button>
                ) : null}
              </header>

              {notifications.length === 0 ? (
                <div className="px-5 pb-8 pt-6 text-center">
                  <p className="text-[15px] font-semibold">{t.emptyTitle}</p>
                  <p className="mx-auto mt-1 max-w-[32ch] text-[14px] leading-snug text-[var(--lp-text-sub)] font-medium">{t.emptyBody}</p>
                </div>
              ) : (
                <>
                  <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openItem(n)}
                          className={`flex w-full items-start gap-3 rounded-[16px] px-3 py-3 text-start transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] ${n.read ? '' : 'bg-[var(--tint)]'}`}
                        >
                          <KindIcon type={n.type} />
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[14px] leading-snug ${n.read ? 'text-[var(--lp-text-sub)]' : 'font-medium text-[var(--lp-dark)]'}`}>
                              {n.summary}
                            </span>
                            <span className="mt-1 block text-[14px] text-[var(--lp-text-muted)]">{relativeTime(n.ts)}</span>
                          </span>
                          {n.read ? null : <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--lp-accent)]" />}
                          <span className="sr-only">{t.openAction}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <footer className="border-t border-[var(--lp-border-light)] px-5 py-1 text-end">
                    <button type="button" onClick={clearAll} className="-me-2 min-h-11 rounded-full px-3 text-[14px] text-[var(--lp-text-muted)] transition-colors hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
                      {t.clear}
                    </button>
                  </footer>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
