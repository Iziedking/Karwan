'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  subscribeToToasts,
  type AppNotification,
} from '../hooks/useNotifications';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';
import { KindIcon } from './KindIcon';
import type { Messages } from '@/shared/i18n/messages';

interface ActiveToast extends AppNotification {
  /// Timestamp the toast was queued. Used for the 6s auto-dismiss.
  queuedAt: number;
}

const DISMISS_MS = 6_000;
const MAX_VISIBLE = 3;

/// Floating toast stack, full width on phones. Listens to subscribeToToasts() and
/// shows a card per high-signal event. Auto-dismisses each after 6s; click
/// navigates to the event's destination.
export function NotificationToasts() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const router = useRouter();
  const trToast = useTranslations().notifications.toast;
  const toastLabels = trToast.labels;

  useEffect(() => {
    const unsub = subscribeToToasts((n) => {
      setToasts((list) => {
        if (list.some((t) => t.id === n.id)) return list;
        const next: ActiveToast = { ...n, queuedAt: Date.now() };
        return [...list, next].slice(-MAX_VISIBLE);
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setToasts((list) => list.filter((t) => now - t.queuedAt < DISMISS_MS));
    }, 500);
    return () => clearInterval(id);
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  function dismiss(id: string) {
    setToasts((list) => list.filter((t) => t.id !== id));
  }

  return (
    <div
      className="pointer-events-none fixed end-3 start-3 top-[72px] z-[60] flex flex-col gap-2 sm:start-auto sm:end-6 sm:w-[380px]"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="fade-up pointer-events-auto flex items-start gap-1 rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-1.5 text-[var(--lp-dark)]"
          style={{ boxShadow: 'var(--product-panel-shadow, 0 14px 36px -16px rgba(0,0,0,0.35))' }}
        >
          <button
            type="button"
            onClick={() => {
              dismiss(t.id);
              router.push(t.href);
            }}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-[14px] p-2 text-start transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
          >
            <KindIcon type={t.type} />
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-[var(--lp-text-sub)]">{labelFor(t.type, toastLabels)}</span>
              <span className="mt-0.5 block text-[14px] font-medium leading-snug">{t.summary}</span>
            </span>
            <span className="sr-only">{trToast.openAction}</span>
          </button>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label={trToast.dismiss}
            className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--lp-text-muted)] transition-colors hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

type ToastLabels = Messages['notifications']['toast']['labels'];

function labelFor(type: string, labels: ToastLabels): string {
  switch (type) {
    case 'deal.matched':
      return labels.matchFound;
    case 'deal.match.approved':
      return labels.escrowFunded;
    case 'deal.cancel.proposed':
      return labels.cancelProposed;
    case 'deal.fund.insufficient':
      return labels.topUpNeeded;
    case 'negotiation.near-miss':
      return labels.nearMatch;
    case 'job.expired':
      return labels.briefExpired;
    default:
      return labels.defaultLabel;
  }
}
