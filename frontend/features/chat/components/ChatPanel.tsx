'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { Note } from '@/shared/components/AppUI';
import { useChat } from '../hooks/useChat';

/// Per-deal end-to-end chat between the buyer and seller. Lives inside the
/// deal detail page; sound on incoming, live via SSE, plus a Telegram fan-out
/// from the backend so users can read replies from outside the app too.
export function ChatPanel({
  jobId,
  caller,
  counterpartyLabel,
}: {
  jobId: string;
  caller: string;
  counterpartyLabel: string;
}) {
  const { messages, fetchState, send, sending } = useChat({ jobId, caller });
  const [draft, setDraft] = useState('');
  const me = caller.toLowerCase();
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !draft.trim()) return;
    const body = draft;
    setDraft('');
    try {
      await send(body);
    } catch {
      setDraft(body);
    }
  }

  return (
    <section className="rounded-[28px] bg-[var(--lp-card)] text-[var(--lp-dark)] overflow-hidden">
      <div className="px-7 pt-6 pb-4 border-b border-black/[0.06]">
        <h2 className="font-sans text-[20px] font-bold tracking-[-0.02em]">Chat</h2>
        <p className="mt-1 mono text-[11px] text-[var(--lp-text-sub)]">
          with {counterpartyLabel} · also delivered to Telegram when linked
        </p>
      </div>

      <div
        ref={listRef}
        className="px-7 py-5 max-h-[420px] overflow-y-auto space-y-3 bg-[var(--lp-light)]/40"
      >
        {fetchState === 'loading' && (
          <div className="space-y-2">
            <div className="h-10 w-2/3 rounded-[14px] bg-black/[0.05] animate-pulse" />
            <div className="h-10 w-1/2 ml-auto rounded-[14px] bg-black/[0.05] animate-pulse" />
          </div>
        )}
        {fetchState === 'error' && <Note tone="error">Could not load chat history.</Note>}
        {fetchState === 'ready' && messages.length === 0 && (
          <p className="py-6 text-center text-[12.5px] text-[var(--lp-text-sub)]">
            No messages yet. Say hello to get the deal moving.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender.toLowerCase() === me;
          return (
            <div
              key={m.id}
              className={cn('flex', mine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[78%] rounded-[16px] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words',
                  mine
                    ? 'bg-[var(--lp-dark)] text-white'
                    : 'bg-[var(--lp-card)] text-[var(--lp-dark)] border border-black/[0.06]',
                )}
              >
                <p>{m.body}</p>
                <p
                  className={cn(
                    'mt-1 mono text-[10px]',
                    mine ? 'text-white/55' : 'text-[var(--lp-text-muted)]',
                  )}
                >
                  {formatTs(m.ts)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={onSubmit}
        className="px-7 py-4 border-t border-black/[0.06] flex items-center gap-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          className="flex-1 rounded-full bg-[var(--lp-light)] px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--lp-dark)]/15 placeholder:text-[var(--lp-text-muted)]"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lp-accent)] text-[var(--lp-dark)] px-4 py-2.5 text-[13px] font-semibold transition-all duration-200 hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {sending ? 'Sending…' : 'Send'}
          {!sending && <span aria-hidden>→</span>}
        </button>
      </form>
    </section>
  );
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return `${md} ${hh}:${mm}`;
}
