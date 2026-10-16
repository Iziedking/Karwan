'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChainEvent } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { newNudges, nudgeKey } from '../agentNudges';

const SHOW_MS = 6_000;
const MAX_SHOWN = 3;

interface Shown {
  key: string;
  text: string;
  at: number;
}

/// Short notes that pop up and fade as agents move, for anyone watching a
/// request or the seller desk. Nothing is lost when they fade: the timeline and
/// the desk keep the record.
export function NudgeStack({ items }: { items: { key: string; text: string }[] }) {
  const copy = useTranslations().agentNudges;
  const [shown, setShown] = useState<Shown[]>([]);
  const last = useRef(0);

  useEffect(() => {
    if (items.length <= last.current) {
      last.current = items.length;
      return;
    }
    const fresh = items.slice(last.current).map((n) => ({ ...n, at: Date.now() }));
    last.current = items.length;
    setShown((list) => [...list, ...fresh].slice(-MAX_SHOWN));
  }, [items]);

  useEffect(() => {
    if (shown.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setShown((list) => list.filter((n) => now - n.at < SHOW_MS));
    }, 500);
    return () => clearInterval(id);
  }, [shown.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={copy.label}
      className="pointer-events-none fixed bottom-4 end-3 start-3 z-[55] flex flex-col gap-2 sm:start-auto sm:w-[360px]"
    >
      {shown.map((n) => (
        <div
          key={n.key}
          className="pointer-events-auto flex items-start gap-3 rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 py-3 shadow-sm motion-safe:animate-[karwan-nudge-in_200ms_ease-out]"
        >
          <p dir="auto" className="min-w-0 flex-1 text-[14px] font-medium text-[var(--lp-dark)]">{n.text}</p>
          <button
            type="button"
            onClick={() => setShown((list) => list.filter((x) => x.key !== n.key))}
            className="-me-2 -mt-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[14px] font-semibold text-[var(--ink-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {copy.dismiss}
          </button>
        </div>
      ))}
    </div>
  );
}

/// Agent moves on one request, as they arrive. Events already on the page when
/// it opened are history, so they never pop up.
export function AgentNudges({ events }: { events: readonly ChainEvent[] }) {
  const copy = useTranslations().agentNudges;
  const seen = useRef<Set<string> | null>(null);
  const [items, setItems] = useState<{ key: string; text: string }[]>([]);

  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(events.map(nudgeKey));
      return;
    }
    const fresh = newNudges(events, seen.current, copy);
    if (fresh.length) setItems((list) => [...list, ...fresh]);
  }, [events, copy]);

  return <NudgeStack items={items} />;
}
