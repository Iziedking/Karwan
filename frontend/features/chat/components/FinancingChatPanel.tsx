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
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if ((!body && !imageDataUrl) || sending || !writable) return;
    setSending(true);
    try {
      const r = await api.sendFinancingMessage(kind, positionId, body, replyingTo?.id, imageDataUrl ?? undefined);
      setMessages(value => [...value, r.message]);
      setDraft('');
      setImageDataUrl(null);
      setReplyingTo(null);
      setSendError(null);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'unable to send this message.');
    } finally {
      setSending(false);
    }
  }

  function onImageSelected(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setSendError('only png, jpeg, or webp images are supported.');
      return;
    }
    if (file.size > 750_000) {
      setSendError('image must be smaller than 750 kb.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result);
        setSendError(null);
      }
    };
    reader.onerror = () => setSendError('we could not read that image.');
    reader.readAsDataURL(file);
  }

  return (
    <section className="flex h-[min(68vh,620px)] min-h-[360px] min-w-0 flex-col overflow-hidden border border-[var(--lp-border-light)] bg-[var(--lp-card)]" style={{ borderRadius: 16 }}>
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
                {quoted ? <div className={`mb-2 border-s-2 px-2 py-1.5 text-xs ${mine ? 'border-white/55 bg-white/10 text-white/80' : 'border-[var(--lp-text-muted)] bg-black/[0.035] text-[var(--lp-text-sub)]'}`}><p className="mono mb-0.5 text-[8px] font-bold uppercase tracking-[0.12em]">{roleFor(quoted.sender)}</p><p>{excerpt(quoted.body)}</p></div> : null}
                {message.imageDataUrl ? <img src={message.imageDataUrl} alt="image attachment" className="mb-2 max-h-56 w-full rounded-lg object-contain" /> : null}
                {message.body ? <p className="whitespace-pre-wrap break-words">{message.body}</p> : null}
              </div>
              {writable ? <button type="button" onClick={() => setReplyingTo(message)} className={`mt-1 mono text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-muted)] underline-offset-2 hover:underline ${mine ? 'float-right' : ''}`}>Reply</button> : null}
            </div>
          </article>;
        })}
        <div ref={endRef} />
      </div>

      <footer className="border-t border-[var(--lp-border-light)] bg-white/40 p-3 sm:p-4">
        {writable ? <>
          {sendError ? <p className="mb-2 border-s-2 border-orange-500/70 px-2 text-xs text-orange-700">{sendError}</p> : null}
          {imageDataUrl ? <div className="mb-2 flex items-center gap-2"><img src={imageDataUrl} alt="image preview" className="h-14 w-14 rounded-lg border border-[var(--lp-border-light)] object-cover" /><button type="button" onClick={() => setImageDataUrl(null)} className="min-h-11 px-2 mono text-[9px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] underline">remove image</button></div> : null}
          {replyingTo ? <div className="mb-2 flex items-start justify-between gap-3 border-s-2 border-[var(--lp-dark)] bg-white/65 px-3 py-2"><div className="min-w-0"><p className="mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">Replying to {roleFor(replyingTo.sender)}</p><p className="mt-0.5 truncate text-xs text-[var(--lp-text-sub)]">{excerpt(replyingTo.body)}</p></div><button type="button" onClick={() => setReplyingTo(null)} aria-label={fc.cancelReply} className="shrink-0 text-lg leading-none text-[var(--lp-text-muted)]">×</button></div> : null}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => { onImageSelected(event.target.files?.[0]); event.currentTarget.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="attach image" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--lp-border-light)] text-lg text-[var(--lp-text-sub)]">+</button>
            <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={1} maxLength={2000} placeholder={imageDataUrl ? 'image only or add a message' : fc.placeholder} className="min-h-11 max-h-28 min-w-0 flex-1 resize-none border border-[var(--lp-border-light)] bg-white px-3 py-2.5 text-sm text-[var(--lp-dark)] outline-none focus:border-[var(--lp-dark)]" style={{ borderRadius: 10 }} />
            <button type="button" disabled={(!draft.trim() && !imageDataUrl) || sending} onClick={() => void send()} className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-[var(--lp-dark)] px-4 text-xs font-semibold text-white disabled:opacity-40">{sending ? 'sending' : 'send'}</button>
          </div>
        </> : <div className="rounded-lg border border-[var(--lp-border-light)] bg-white/55 px-3 py-3 text-xs leading-5 text-[var(--lp-text-sub)]"><strong className="text-[var(--lp-dark)]">{fc.closedTitle}</strong> {fc.closedBody}</div>}
      </footer>
    </section>
  );
}
