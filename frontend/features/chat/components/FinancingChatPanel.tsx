'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { api, type ChatMessage } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { shortAddress } from '@/shared/utils/format';

function excerpt(value: string) {
  return value.length > 110 ? `${value.slice(0, 107)}…` : value;
}

/// The private conversation between the seller and the financier of one
/// financing position. Theme tokens throughout, so it reads in light and dark.
export function FinancingChatPanel({ kind, positionId, seller, financier, bare = false }: { kind: 'factoring' | 'po'; positionId: string; seller: string; financier: string; bare?: boolean }) {
  const fc = useTranslations().financingChat;
  const { locale } = useLocale();
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
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });

  function roleFor(address: string) {
    const normalized = address.toLowerCase();
    if (normalized === seller.toLowerCase()) return fc.seller;
    if (normalized === financier.toLowerCase()) return fc.financier;
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
    } catch {
      setSendError(fc.errSend);
    } finally {
      setSending(false);
    }
  }

  function onImageSelected(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setSendError(fc.errImageType);
      return;
    }
    if (file.size > 750_000) {
      setSendError(fc.errImageSize);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result);
        setSendError(null);
      }
    };
    reader.onerror = () => setSendError(fc.errImageRead);
    reader.readAsDataURL(file);
  }

  return (
    <section aria-labelledby={bare ? undefined : 'financing-chat-title'} className={bare ? '' : 'border-t border-[var(--line)] pt-6'}>
      {bare ? null : <h2 id="financing-chat-title" className="text-[17px] font-medium text-[var(--ink)]">{fc.privateConversation}</h2>}
      <p className={`${bare ? '' : 'mt-1 '}text-[15px] text-[var(--lp-text-sub)]`}>{fc.coordinateBody}</p>

      <div className="mt-4 max-h-[min(60vh,520px)] min-h-[200px] space-y-3 overflow-y-auto">
        {messages.length === 0 ? <p className="py-8 text-center text-[15px] text-[var(--lp-text-sub)]">{fc.startBody}</p> : null}
        {messages.map(message => {
          if (message.kind === 'system') {
            return <p key={message.id} className="py-1 text-center text-[14px] text-[var(--lp-text-sub)]">{message.body}</p>;
          }
          const mine = !!auth.address && message.sender.toLowerCase() === auth.address.toLowerCase();
          const quoted = message.replyToId ? byId.get(message.replyToId) : undefined;
          return (
            <article key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[88%] sm:max-w-[76%]">
                <p className={`mb-1 flex items-center gap-2 text-[13px] text-[var(--lp-text-sub)] ${mine ? 'justify-end' : ''}`}>
                  <span className="font-medium text-[var(--ink)]">{mine ? fc.you : roleFor(message.sender)}</span>
                  <span className="tabular-nums">{time.format(message.ts)}</span>
                </p>
                <div
                  className={`px-3.5 py-2.5 text-[15px] leading-6 text-[var(--ink)] ${mine ? 'bg-[var(--tint)]' : 'border border-[var(--line)]'}`}
                  style={{ borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px' }}
                >
                  {quoted ? (
                    <div className="mb-2 border-s-2 border-[var(--lp-text-sub)] ps-2 text-[14px] text-[var(--lp-text-sub)]">
                      <p className="font-medium">{roleFor(quoted.sender)}</p>
                      <p>{excerpt(quoted.body)}</p>
                    </div>
                  ) : null}
                  {message.imageDataUrl ? <img src={message.imageDataUrl} alt="" className="mb-2 max-h-56 w-full rounded-lg object-contain" /> : null}
                  {message.body ? <p dir="auto" className="whitespace-pre-wrap break-words">{message.body}</p> : null}
                </div>
                {writable ? (
                  <button type="button" onClick={() => setReplyingTo(message)} className={`mt-1 inline-flex min-h-11 items-center text-[14px] font-medium text-[var(--lp-text-sub)] hover:text-[var(--ink)] ${mine ? 'float-right' : ''}`}>
                    {fc.reply}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="mt-4 border-t border-[var(--line)] pt-4">
        {writable ? (
          <>
            {sendError ? <p role="alert" className="mb-3 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--ink)]">{sendError}</p> : null}
            {imageDataUrl ? (
              <div className="mb-3 flex items-center gap-3">
                <img src={imageDataUrl} alt="" className="h-14 w-14 rounded-lg border border-[var(--line)] object-cover" />
                <button type="button" onClick={() => setImageDataUrl(null)} className="inline-flex min-h-11 items-center text-[14px] font-medium text-[var(--ink)] underline underline-offset-4">{fc.removeImage}</button>
              </div>
            ) : null}
            {replyingTo ? (
              <div className="mb-3 flex items-start justify-between gap-3 border-s-2 border-[var(--ink)] ps-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[var(--ink)]">{fc.replyingTo.replace('{who}', roleFor(replyingTo.sender))}</p>
                  <p className="mt-0.5 truncate text-[14px] text-[var(--lp-text-sub)]">{excerpt(replyingTo.body)}</p>
                </div>
                <button type="button" onClick={() => setReplyingTo(null)} aria-label={fc.cancelReply} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[18px] text-[var(--lp-text-sub)]">×</button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => { onImageSelected(event.target.files?.[0]); event.currentTarget.value = ''; }} />
              <button type="button" onClick={() => fileRef.current?.click()} aria-label={fc.attachImage} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[var(--line)] text-[18px] text-[var(--ink)]">+</button>
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}
                rows={1}
                maxLength={2000}
                dir="auto"
                aria-label={fc.placeholder}
                placeholder={imageDataUrl ? fc.imageOnly : fc.placeholder}
                className="form-input min-h-11 max-h-28 min-w-0 flex-1 resize-none font-normal"
              />
              <button
                type="button"
                disabled={(!draft.trim() && !imageDataUrl) || sending}
                onClick={() => void send()}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[var(--action)] px-5 text-[15px] font-semibold text-[var(--on-action)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? fc.sending : fc.send}
              </button>
            </div>
          </>
        ) : (
          <p className="text-[15px] text-[var(--lp-text-sub)]"><span className="font-medium text-[var(--ink)]">{fc.closedTitle}</span> {fc.closedBody}</p>
        )}
      </div>
    </section>
  );
}
