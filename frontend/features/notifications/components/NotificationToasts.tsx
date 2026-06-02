'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  subscribeToToasts,
  type AppNotification,
} from '../hooks/useNotifications';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages';

interface ActiveToast extends AppNotification {
  /// Timestamp the toast was queued. Used for the 6s auto-dismiss.
  queuedAt: number;
}

const DISMISS_MS = 6_000;
const MAX_VISIBLE = 3;

/// Floating phantom-grade toast stack. Listens to subscribeToToasts() and
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
      className="fixed top-[80px] end-4 sm:end-6 z-[60] flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            dismiss(t.id);
            router.push(t.href);
          }}
          className="group pointer-events-auto fade-up text-start overflow-hidden block w-[320px] max-w-[80vw]"
          style={{
            background: 'var(--lp-card)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
            boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 14px 36px -14px rgba(0,0,0,0.32)',
          }}
        >
          <div
            className="flex items-center gap-1.5 px-3 py-1.5"
            style={{ background: 'var(--lp-accent)' }}
          >
            <span
              aria-hidden
              data-instrument-blink
              className="inline-block w-[5px] h-[5px] bg-[var(--lp-band-dark)]"
              style={{ animation: 'instrumentBlink 1.6s ease-in-out infinite' }}
            />
            <span className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--lp-dark)]">
              {labelFor(t.type, toastLabels)}
            </span>
            <span
              aria-hidden
              className="ms-auto mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-dark)]/60"
            >
              {t.jobId.slice(0, 6)}...{t.jobId.slice(-4)}
            </span>
          </div>
          <div className="px-3.5 py-3 flex items-start justify-between gap-3">
            <p className="text-[13px] leading-snug text-[var(--lp-dark)] font-medium">
              {t.summary}
            </p>
            <span
              aria-hidden
              className="shrink-0 mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] transition-colors group-hover:text-[var(--lp-dark)]"
            >
              {trToast.openAction} →
            </span>
          </div>
        </button>
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
