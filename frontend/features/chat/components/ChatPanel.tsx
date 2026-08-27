'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { ApiError, type ChatMessage } from '@/core/api';
import { useChat } from '../hooks/useChat';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// A compact, deal-scoped conversation. Replies preserve context, images are
/// the only attachment type, and the server enforces the retention window.
export function ChatPanel({ jobId, caller, counterpartyLabel, draftSeed, draftSeedKey }: { jobId: string; caller: string; counterpartyLabel: string; draftSeed?: string; draftSeedKey?: number }) {
  const cp = useTranslations().chatPanel;
  const { messages, fetchState, fetchError, send, sending, writable } = useChat({ jobId, caller });
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const me = caller.toLowerCase();
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);

  useEffect(() => { if (!draftSeed) return; setDraft(draftSeed); requestAnimationFrame(() => inputRef.current?.focus()); }, [draftSeed, draftSeedKey]);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (sending || (!draft.trim() && !imageDataUrl) || !writable) return;
    const body = draft;
    const attachment = imageDataUrl ?? undefined;
    const target = replyTo?.id;
    setDraft(''); setImageDataUrl(null); setReplyTo(null); setSendError(null);
    try { await send({ body, replyToId: target, imageDataUrl: attachment }); }
    catch (err) { setDraft(body); setSendError(err instanceof ApiError ? err.message : cp.loadError); }
  }

  function onImageSelected(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setSendError(cp.imageUnsupported); return; }
    if (file.size > 750_000) { setSendError(cp.imageTooLarge); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') { setImageDataUrl(reader.result); setSendError(null); } };
    reader.onerror = () => setSendError(cp.imageReadError);
    reader.readAsDataURL(file);
  }

  return <section className="mx-auto w-full max-w-[860px] overflow-hidden rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] shadow-[0_12px_36px_rgba(0,0,0,0.07)]">
    <header className="flex items-center justify-between gap-3 border-b border-[var(--lp-border-light)] px-4 py-4 sm:px-5"><div className="min-w-0"><span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">{cp.withCounterpartyTemplate.replace('{name}', counterpartyLabel.toUpperCase())}</span><p className="mt-1 text-xs text-[var(--lp-text-sub)]">{cp.telegramNote}</p></div><span className="mono shrink-0 text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">{cp.retentionNote}</span></header>
    <div ref={listRef} className="h-[min(52vh,460px)] min-h-[260px] space-y-3 overflow-y-auto bg-[var(--lp-light)]/50 px-4 py-4 sm:px-5">
      {fetchState === 'loading' ? <div className="space-y-2"><div className="h-10 w-2/3 animate-pulse rounded-xl bg-black/[0.05] motion-reduce:animate-none" /><div className="ms-auto h-10 w-1/2 animate-pulse rounded-xl bg-black/[0.05] motion-reduce:animate-none" /></div> : null}
      {fetchState === 'error' ? <div className="rounded-xl border border-red-300/50 bg-red-500/10 px-3 py-2.5 text-xs text-red-700">{fetchError ?? cp.loadError}</div> : null}
      {fetchState === 'ready' && messages.length === 0 ? <p className="py-8 text-center mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">{cp.emptyMessage}</p> : null}
      {messages.map((message) => { const sender = typeof message.sender === 'string' ? message.sender : ''; if (message.kind === 'system' || !sender) return <p key={message.id} className="px-2 py-1 text-center text-xs text-[var(--lp-text-muted)]">{message.body}</p>; const mine = sender.toLowerCase() === me; const quoted = message.replyToId ? byId.get(message.replyToId) : undefined; return <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}><div className="group relative max-w-[82%] sm:max-w-[74%]"><div className={cn('px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words', mine ? 'bg-[var(--lp-band-dark)] text-white' : 'border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)]')} style={{ borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px' }}>{quoted ? <div className={cn('mb-2 border-s-2 px-2 py-1 text-[11px]', mine ? 'border-white/55 bg-white/10 text-white/75' : 'border-[var(--lp-text-muted)] bg-black/[0.035] text-[var(--lp-text-sub)]')}><p className="mono text-[9px] uppercase tracking-[0.1em]">{cp.replyingTo.replace('{name}', quoted.sender.toLowerCase() === me ? cp.you : counterpartyLabel)}</p><p className="truncate">{quoted.body || cp.imageAttachment}</p></div> : null}{message.imageDataUrl ? <img src={message.imageDataUrl} alt={cp.imageAttachment} className="mb-2 max-h-56 w-full rounded-lg object-contain" /> : null}{message.body ? <p>{message.body}</p> : null}<p className={cn('mt-1 mono text-[10px] uppercase tracking-[0.1em]', mine ? 'text-white/55' : 'text-[var(--lp-text-muted)]')}>{formatTs(message.ts)}</p></div>{writable ? <button type="button" onClick={() => { setReplyTo(message); inputRef.current?.focus(); }} className={cn('mt-1 inline-flex min-h-11 items-center px-2 mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] underline-offset-2 hover:underline', mine ? 'float-right' : '')}>{cp.reply}</button> : null}</div></div>; })}
    </div>
    {sendError ? <div className="mx-4 mt-3 rounded-xl border border-orange-300/50 bg-orange-500/10 px-3 py-2.5 text-xs text-orange-800 sm:mx-5">{sendError}</div> : null}
    <form onSubmit={onSubmit} className="border-t border-[var(--lp-border-light)] px-4 py-3 sm:px-5">{!writable ? <p className="text-xs text-[var(--lp-text-muted)]">{cp.conversationClosed}</p> : null}{writable && replyTo ? <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border-s-2 border-[var(--lp-accent)] bg-[var(--lp-light)] px-3 py-2"><p className="min-w-0 truncate text-xs text-[var(--lp-text-sub)]">{cp.replyingTo.replace('{name}', replyTo.sender.toLowerCase() === me ? cp.you : counterpartyLabel)}: {replyTo.body || cp.imageAttachment}</p><button type="button" onClick={() => setReplyTo(null)} className="inline-flex min-h-11 min-w-11 items-center justify-center text-lg text-[var(--lp-text-muted)]" aria-label={cp.cancelReply}>×</button></div> : null}{writable && imageDataUrl ? <div className="mb-2 flex items-center gap-2"><img src={imageDataUrl} alt={cp.imageAttachment} className="h-14 w-14 rounded-lg border border-[var(--lp-border-light)] object-cover" /><button type="button" onClick={() => setImageDataUrl(null)} className="min-h-11 px-2 mono text-[9px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] underline">{cp.removeImage}</button></div> : null}{writable ? <div className="flex items-end gap-2"><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { onImageSelected(event.target.files?.[0]); event.currentTarget.value = ''; }} /><button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--lp-border-light)] text-lg text-[var(--lp-text-sub)] hover:border-[var(--lp-dark)]" aria-label={cp.attachImage}>＋</button><textarea ref={inputRef} value={draft} onChange={(event) => { setDraft(event.target.value); if (sendError) setSendError(null); }} placeholder={imageDataUrl ? cp.imageOnly : cp.inputPlaceholder} rows={1} maxLength={2000} className="chat-input min-h-11 max-h-28 min-w-0 flex-1 resize-none rounded-xl bg-[var(--lp-light)] px-4 py-2.5 text-[13px] text-[var(--lp-dark)] placeholder:text-[var(--lp-text-muted)] focus:outline-none" /><button type="submit" disabled={sending || (!draft.trim() && !imageDataUrl) || !writable} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--lp-accent)] px-4 py-2.5 mono text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--lp-band-dark)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50">{sending ? cp.sending : cp.send}{!sending ? <span aria-hidden>→</span> : null}</button></div> : null}</form>
    <style jsx>{`.chat-input { border: 1px solid var(--lp-border-light); } .chat-input:focus { border-color: var(--lp-dark); box-shadow: 0 0 0 3px rgba(175, 201, 91, 0.25); }`}</style>
  </section>;
}

function formatTs(ts: number): string { const d = new Date(ts); const today = new Date(); const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate(); const hh = d.getHours().toString().padStart(2, '0'); const mm = d.getMinutes().toString().padStart(2, '0'); return sameDay ? `${hh}:${mm}` : `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`; }
