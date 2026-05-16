'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/utils/cn';
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
    <div className="overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--lp-border-light)]">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:WITH {counterpartyLabel.toUpperCase()}:]
        </span>
        <p className="mt-2 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          Also delivered to Telegram when linked
        </p>
      </div>

      <div
        ref={listRef}
        className="px-6 py-5 max-h-[420px] overflow-y-auto space-y-3 bg-[var(--lp-light)]/50"
      >
        {fetchState === 'loading' && (
          <div className="space-y-2">
            <div
              className="h-10 w-2/3 bg-black/[0.05] animate-pulse motion-reduce:animate-none"
              style={{
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            />
            <div
              className="h-10 w-1/2 ml-auto bg-black/[0.05] animate-pulse motion-reduce:animate-none"
              style={{
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            />
          </div>
        )}
        {fetchState === 'error' && (
          <div
            className="px-3 py-2.5 text-[12.5px]"
            style={{
              background: 'rgba(176,61,58,0.10)',
              color: '#b03d3a',
              border: '1px solid rgba(176,61,58,0.35)',
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 3,
            }}
          >
            Could not load chat history.
          </div>
        )}
        {fetchState === 'ready' && messages.length === 0 && (
          <p className="py-6 text-center mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            No messages yet. Say hello.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender.toLowerCase() === me;
          return (
            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[78%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words',
                  mine
                    ? 'bg-[var(--lp-band-dark)] text-white'
                    : 'bg-[var(--lp-card)] text-[var(--lp-dark)] border border-[var(--lp-border-light)]',
                )}
                style={{
                  borderTopLeftRadius: mine ? 12 : 12,
                  borderTopRightRadius: mine ? 12 : 12,
                  borderBottomLeftRadius: mine ? 12 : 3,
                  borderBottomRightRadius: mine ? 3 : 12,
                }}
              >
                <p>{m.body}</p>
                <p
                  className={cn(
                    'mt-1 mono text-[10px] uppercase tracking-[0.1em]',
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
        className="px-6 py-4 border-t border-[var(--lp-border-light)] flex items-center gap-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          className="chat-input flex-1 bg-[var(--lp-light)] px-4 py-2.5 text-[13px] focus:outline-none placeholder:text-[var(--lp-text-muted)] text-[var(--lp-dark)] transition-shadow"
          style={{
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 mono text-[12px] font-bold uppercase tracking-[0.08em] transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          style={{
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
            boxShadow: !sending && draft.trim() ? '0 3px 0 rgba(0,0,0,0.22)' : 'none',
          }}
        >
          {sending ? 'Sending…' : 'Send'}
          {!sending && <span aria-hidden>→</span>}
        </button>
      </form>
      <style jsx>{`
        .chat-input:focus {
          border-color: var(--lp-dark);
          box-shadow: 0 0 0 3px rgba(189, 225, 34, 0.25);
        }
      `}</style>
    </div>
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
