'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { api, type ChatMessage } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { shortAddress } from '@/shared/utils/format';

function excerpt(value: string) {
  return value.length > 110 ? `${value.slice(0, 107)}…` : value;
}

export function FinancingChatPanel({ kind, positionId, seller, financier }: { kind: 'factoring' | 'po'; positionId: string; seller: string; financier: string }) {
  const fc = useTranslations().financingChat;
  const auth = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [writable, setWritable] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const load = () => api.listFinancingMessages(kind, positionId).then(r => { if (active) { setMessages(r.messages); setWritable(r.writable); } }).catch(() => {});
    load();
    const id = setInterval(load, 20_000);
    return () => { active = false; clearInterval(id); };
  }, [kind, positionId]);

  const byId = useMemo(() => new Map(messages.map(message => [message.id, message])), [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  function roleFor(address: string) {
    const normalized = address.toLowerCase();
    if (normalized === seller.toLowerCase()) return 'Seller';
    if (normalized === financier.toLowerCase()) return 'Financier';
    return shortAddress(address);
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const r = await api.sendFinancingMessage(kind, positionId, body, replyingTo?.id);
      setMessages(value => [...value, r.message]);
      setDraft('');
      setReplyingTo(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden border border-[var(--lp-border-light)] bg-[var(--lp-card)] lg:h-[720px]" style={{ borderRadius: 16 }}>
      <header className="border-b border-[var(--lp-border-light)] px-4 py-4 sm:px-5">
        <p className="mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--lp-text-muted)]">{fc.title}</p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--lp-dark)]">{fc.privateConversation}</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--lp-text-sub)]">{fc.coordinateBody}</p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
        {messages.length === 0 ? <div className="mx-auto mt-12 max-w-xs text-center"><p className="text-sm font-medium text-[var(--lp-dark)]">{fc.startTitle}</p><p className="mt-1 text-xs leading-5 text-[var(--lp-text-muted)]">{fc.startBody}</p></div> : null}
        {messages.map(message => {
          if (message.kind === 'system') return <div key={message.id} className="flex items-center gap-3 py-1"><span className="h-px flex-1 bg-[var(--lp-border-light)]" /><p className="max-w-[75%] text-center text-[10px] text-[var(--lp-text-muted)]">{message.body}</p><span className="h-px flex-1 bg-[var(--lp-border-light)]" /></div>;
          const mine = !!auth.address && message.sender.toLowerCase() === auth.address.toLowerCase();
          const quoted = message.replyToId ? byId.get(message.replyToId) : undefined;
          return <article key={message.id} className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[88%] sm:max-w-[76%]">
              <div className={`mb-1 flex items-center gap-2 ${mine ? 'justify-end' : ''}`}><span className="mono text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">{mine ? 'You' : roleFor(message.sender)}</span><span className="text-[9px] text-[var(--lp-text-muted)]">{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(message.ts)}</span></div>
              <div className={`border p-3 text-sm leading-5 ${mine ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-white' : 'border-[var(--lp-border-light)] bg-white/60 text-[var(--lp-dark)]'}`} style={{ borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px' }}>
                {quoted ? <div className={`mb-2 border-l-2 px-2 py-1.5 text-xs ${mine ? 'border-white/55 bg-white/10 text-white/80' : 'border-[var(--lp-text-muted)] bg-black/[0.035] text-[var(--lp-text-sub)]'}`}><p className="mono mb-0.5 text-[8px] font-bold uppercase tracking-[0.12em]">{roleFor(quoted.sender)}</p><p>{excerpt(quoted.body)}</p></div> : null}
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
              </div>
              {writable ? <button type="button" onClick={() => setReplyingTo(message)} className={`mt-1 mono text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-muted)] underline-offset-2 hover:underline ${mine ? 'float-right' : ''}`}>Reply</button> : null}
            </div>
          </article>;
        })}
        <div ref={endRef} />
      </div>

      <footer className="border-t border-[var(--lp-border-light)] bg-white/40 p-3 sm:p-4">
        {writable ? <>
          {replyingTo ? <div className="mb-2 flex items-start justify-between gap-3 border-l-2 border-[var(--lp-dark)] bg-white/65 px-3 py-2"><div className="min-w-0"><p className="mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">Replying to {roleFor(replyingTo.sender)}</p><p className="mt-0.5 truncate text-xs text-[var(--lp-text-sub)]">{excerpt(replyingTo.body)}</p></div><button type="button" onClick={() => setReplyingTo(null)} aria-label={fc.cancelReply} className="shrink-0 text-lg leading-none text-[var(--lp-text-muted)]">×</button></div> : null}
          <div className="flex items-end gap-2">
            <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} maxLength={2000} placeholder={fc.placeholder} className="min-h-[48px] min-w-0 flex-1 resize-none border border-[var(--lp-border-light)] bg-white px-3 py-2.5 text-sm text-[var(--lp-dark)] outline-none focus:border-[var(--lp-dark)]" style={{ borderRadius: 10 }} />
            <button type="button" disabled={!draft.trim() || sending} onClick={() => void send()} className="h-12 shrink-0 bg-[var(--lp-dark)] px-4 text-xs font-semibold text-white disabled:opacity-40" style={{ borderRadius: 10 }}>{sending ? 'Sending…' : 'Send'}</button>
          </div>
        </> : <div className="rounded-lg border border-[var(--lp-border-light)] bg-white/55 px-3 py-3 text-xs leading-5 text-[var(--lp-text-sub)]"><strong className="text-[var(--lp-dark)]">{fc.closedTitle}</strong> {fc.closedBody}</div>}
      </footer>
    </section>
  );
}
