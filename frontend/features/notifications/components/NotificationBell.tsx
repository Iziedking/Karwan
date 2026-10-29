'use client';
import { Tooltip } from '@/shared/components/Tooltip';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { Icon } from '@/shared/components/Icon';
import { useNotifications, type AppNotification } from '../hooks/useNotifications';
import { safeNotificationHref } from '../notificationRouting';
import { groupNotifications, type NotificationGroup } from '../groupNotifications';
import { relativeTime } from '@/shared/utils/format';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { requestPageRefresh } from '@/shared/utils/pageRefresh';
import { KindIcon } from './KindIcon';
import Link from 'next/link';
import { useMessageInbox } from '@/features/messages/useMessageInbox';

export function NotificationBell() {
  const { locale } = useLocale();
  const { isAuthenticated: isConnected } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const all = useTranslations();
  const t = all.notifications.bell;
  const inbox = all.directMessages.inbox;
  const messages = useMessageInbox();
  const badge = unreadCount + messages.unread;
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

  function openItem(group: NotificationGroup) {
    const n: AppNotification = group.lead;
    group.ids.forEach(markRead);
    setOpen(false);
    const href = safeNotificationHref(n);
    // Already on that page: navigating to it changes nothing, so ask the page
    // to read its data again.
    if (href.split('#')[0] === window.location.pathname) requestPageRefresh();
    router.push(href);
  }

  return (
    <div ref={wrapRef} className="relative">
      <Tooltip label={t.aria} align="end" off={open}>
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          aria-label={badge > 0 ? `${t.aria}, ${badge} unread` : t.aria}
          aria-expanded={open}
          className="relative inline-flex size-9 items-center justify-center rounded-full text-[var(--color-ink-dim)] before:absolute before:-inset-1 before:content-[''] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          <Icon name="bell" size={20} />
          {badge > 0 ? (
            <span
              aria-hidden
              className="absolute -end-1.5 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--lp-accent)] px-[5px] text-[13px] font-semibold tabular-nums leading-none tracking-[-0.02em] text-[var(--accent-ink)] shadow-[0_0_0_1.5px_var(--color-surface)]"
            >
              {badge > 9 ? '9+' : badge}
            </span>
          ) : null}
        </button>
      </Tooltip>

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

              {/* Messages people sent by tag live in their own inbox; this row says
                  how many have something new and opens it. */}
              {messages.conversations.length > 0 ? (
                <Link
                  href="/messages"
                  onClick={() => setOpen(false)}
                  className="mx-2 mb-1 flex min-h-12 items-center justify-between gap-3 rounded-[16px] px-3 text-start transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
                >
                  <span className="text-[15px] font-semibold text-[var(--lp-dark)]">{inbox.title}</span>
                  <span className={`text-[14px] ${messages.unread > 0 ? 'font-semibold text-[var(--lp-dark)]' : 'font-medium text-[var(--lp-text-sub)]'}`}>
                    {messages.unread === 0 ? inbox.noneNew : messages.unread === 1 ? inbox.newOne : inbox.newMany.replace('{n}', String(messages.unread))}
                  </span>
                </Link>
              ) : null}

              {notifications.length === 0 ? (
                <div className="px-5 pb-8 pt-6 text-center">
                  <p className="text-[15px] font-semibold">{t.emptyTitle}</p>
                  <p className="mx-auto mt-1 max-w-[32ch] text-[14px] leading-snug text-[var(--lp-text-sub)] font-medium">{t.emptyBody}</p>
                </div>
              ) : (
                <>
                  <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    {groupNotifications(notifications).map((group) => {
                      const n = group.lead;
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => openItem(group)}
                            className={`flex w-full items-start gap-3 rounded-[16px] px-3 py-3 text-start transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] ${group.read ? '' : 'bg-[color-mix(in_srgb,var(--lp-accent)_12%,transparent)]'}`}
                          >
                            <KindIcon type={n.type} />
                            <span className="min-w-0 flex-1">
                              {group.read ? null : <span className="sr-only">{t.unread}: </span>}
                              <span className={`block text-[14px] leading-snug ${group.read ? 'font-medium text-[var(--lp-text-sub)]' : 'font-semibold text-[var(--lp-dark)]'}`}>
                                {n.summary}
                              </span>
                              <span className="mt-1 block text-[14px] font-medium text-[var(--lp-text-muted)]">
                                {relativeTime(n.ts, locale)}
                                {group.count > 1 ? ` · ${t.timesTemplate.replace('{n}', String(group.count))}` : ''}
                              </span>
                            </span>
                            {group.read ? null : <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[var(--lp-accent)]" />}
                            <span className="sr-only">{t.openAction}</span>
                          </button>
                        </li>
                      );
                    })}
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
