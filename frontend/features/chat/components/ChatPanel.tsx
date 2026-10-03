'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { ApiError, type ChatMessage } from '@/core/api';
import { Icon } from '@/shared/components/Icon';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { useChat } from '../hooks/useChat';

/// A deal-scoped conversation. Replies keep their context, images are the only
/// attachment type, and the server enforces the retention window.
export function ChatPanel({ jobId, caller, counterpartyLabel, counterpartyAddress, draftSeed, draftSeedKey }: { jobId: string; caller: string; counterpartyLabel: string; counterpartyAddress?: string; draftSeed?: string; draftSeedKey?: number }) {
  const cp = useTranslations().chatPanel;
  const { locale } = useLocale();
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
  const canSend = writable && !sending && (!!draft.trim() || !!imageDataUrl);

  useEffect(() => { if (!draftSeed) return; setDraft(draftSeed); requestAnimationFrame(() => inputRef.current?.focus()); }, [draftSeed, draftSeedKey]);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.max(24, Math.min(input.scrollHeight, 144))}px`;
    input.style.overflowY = input.scrollHeight > 144 ? 'auto' : 'hidden';
  }, [draft]);

  async function submit() {
    if (!canSend) return;
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

  const nameOf = (sender: string) => (sender.toLowerCase() === me ? cp.you : counterpartyLabel);

  return (
    <section className="flex w-full flex-col overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
      <header className="flex items-center gap-3 border-b border-[var(--lp-border-light)] px-4 py-3 sm:px-5">
        <PersonAvatar address={counterpartyAddress} name={counterpartyLabel} size={36} />
        <p className="min-w-0 truncate text-[15px] font-semibold text-[var(--lp-dark)]">{counterpartyLabel}</p>
      </header>

      <div ref={listRef} role="log" aria-live="polite" className="h-[min(56vh,520px)] min-h-[280px] overflow-y-auto px-3 py-4 sm:px-5">
        {fetchState === 'loading' ? (
          <div aria-busy="true" className="space-y-2">
            <div className="h-10 w-2/3 rounded-[18px] bg-[var(--lp-light)]" />
            <div className="ms-auto h-10 w-1/2 rounded-[18px] bg-[var(--lp-light)]" />
          </div>
        ) : null}
        {fetchState === 'error' ? <p role="alert" className="text-[14px] text-[var(--lp-dark)]">{fetchError ?? cp.loadError}</p> : null}
        {fetchState === 'ready' && messages.length === 0 ? (
          <p className="grid h-full place-items-center text-[14px] text-[var(--lp-text-sub)]">{cp.emptyMessage}</p>
        ) : null}
        {messages.map((message, index) => {
          const sender = typeof message.sender === 'string' ? message.sender : '';
          const previous = messages[index - 1];
          const newDay = !previous || dayKey(previous.ts) !== dayKey(message.ts);
          const divider = newDay ? (
            <p className="my-3 text-center text-[12px] font-medium text-[var(--lp-text-sub)]">{dayLabel(message.ts, locale)}</p>
          ) : null;
          if (message.kind === 'system' || !sender) {
            return <div key={message.id}>{divider}<p className="my-2 px-6 text-center text-[13px] text-[var(--lp-text-sub)]">{message.body}</p></div>;
          }
          const mine = sender.toLowerCase() === me;
          const grouped = !newDay && previous && previous.kind !== 'system' && previous.sender === message.sender;
          const quoted = message.replyToId ? byId.get(message.replyToId) : undefined;
          const next = messages[index + 1];
          // The face sits beside the last bubble of a run, like any messenger.
          const lastOfRun = !next || next.kind === 'system' || next.sender !== message.sender || dayKey(next.ts) !== dayKey(message.ts);
          return (
            <div key={message.id}>
              {divider}
              <div className={cn('group flex items-end gap-1.5', mine ? 'flex-row-reverse' : 'flex-row', grouped ? 'mt-0.5' : 'mt-3')}>
                <span className="w-7 shrink-0">
                  {lastOfRun ? <PersonAvatar address={sender} name={mine ? cp.you : counterpartyLabel} size={28} /> : null}
                </span>
                <div
                  className={cn(
                    'max-w-[80%] px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap break-words [overflow-wrap:anywhere] sm:max-w-[70%]',
                    mine ? 'bg-[var(--lp-dark)] text-[var(--lp-light)]' : 'bg-[var(--lp-light)] text-[var(--lp-dark)]',
                    mine ? 'rounded-[18px] rounded-ee-[6px]' : 'rounded-[18px] rounded-es-[6px]',
                  )}
                >
                  {quoted ? (
                    <div className={cn('mb-1.5 rounded-[10px] border-s-2 px-2.5 py-1 text-[13px]', mine ? 'border-[var(--lp-accent)] bg-white/10' : 'border-[var(--lp-accent)] bg-[var(--lp-card)]')}>
                      <p className="font-semibold">{nameOf(quoted.sender)}</p>
                      <p className="truncate opacity-80">{quoted.body || cp.imageAttachment}</p>
                    </div>
                  ) : null}
                  {message.imageDataUrl ? (
                    <img src={message.imageDataUrl} alt={cp.imageAttachment} className="mb-1.5 max-h-60 w-full rounded-[12px] object-contain" />
                  ) : null}
                  {message.body ? <span>{message.body}</span> : null}
                  <span className={cn('ms-2 inline-block translate-y-[3px] text-[11px] tabular-nums', mine ? 'text-[var(--lp-light)]/70' : 'text-[var(--lp-text-sub)]')}>
                    {timeOf(message.ts, locale)}
                  </span>
                </div>
                {writable ? (
                  <button
                    type="button"
                    onClick={() => { setReplyTo(message); inputRef.current?.focus(); }}
                    aria-label={`${cp.reply}: ${message.body || cp.imageAttachment}`}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--lp-text-sub)] opacity-0 transition-opacity hover:bg-[var(--lp-light)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Icon name="reply" size={16} directional />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {sendError ? <p role="alert" className="mx-4 mb-2 text-[14px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] sm:mx-5">{sendError}</p> : null}

      {!writable ? (
        <p className="border-t border-[var(--lp-border-light)] px-5 py-4 text-[14px] text-[var(--lp-text-sub)]">{cp.conversationClosed}</p>
      ) : (
        <form
          onSubmit={(event) => { event.preventDefault(); void submit(); }}
          className="border-t border-[var(--lp-border-light)] p-3 sm:px-4"
        >
          {replyTo ? (
            <div className="mb-2 flex items-center gap-2 rounded-[12px] border-s-2 border-[var(--lp-accent)] bg-[var(--lp-light)] py-1 pe-1 ps-3">
              <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--lp-text-sub)]">
                <span className="font-semibold text-[var(--lp-dark)]">{cp.replyingTo.replace('{name}', nameOf(replyTo.sender))}</span> {replyTo.body || cp.imageAttachment}
              </p>
              <button type="button" onClick={() => setReplyTo(null)} aria-label={cp.cancelReply} className="grid size-9 place-items-center rounded-full text-[var(--lp-text-sub)] hover:bg-[var(--lp-card)]">
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : null}
          {imageDataUrl ? (
            <div className="mb-2 flex items-center gap-2">
              <img src={imageDataUrl} alt={cp.imageAttachment} className="size-14 rounded-[12px] border border-[var(--lp-border-light)] object-cover" />
              <button type="button" onClick={() => setImageDataUrl(null)} aria-label={cp.removeImage} className="grid size-9 place-items-center rounded-full text-[var(--lp-text-sub)] hover:bg-[var(--lp-light)]">
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-1.5 rounded-[24px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-1 focus-within:border-[var(--lp-outline-strong)]">
            <input ref={fileRef} type="file" aria-label={cp.attachImage} accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { onImageSelected(event.target.files?.[0]); event.currentTarget.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={cp.attachImage} className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--lp-text-sub)] hover:bg-[var(--lp-card)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
              <Icon name="image-plus" size={20} />
            </button>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => { setDraft(event.target.value); if (sendError) setSendError(null); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
              }}
              placeholder={imageDataUrl ? cp.imageOnly : cp.inputPlaceholder}
              aria-label={cp.inputPlaceholder}
              rows={1}
              maxLength={2000}
              dir="auto"
              className="min-w-0 flex-1 resize-none self-center bg-transparent py-2.5 text-[15px] leading-6 text-[var(--lp-dark)] placeholder:text-[var(--lp-text-sub)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label={sending ? cp.sending : cp.send}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--lp-band-dark)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]"
            >
              <Icon name={sending ? 'loader-circle' : 'send'} size={20} directional={!sending} className={sending ? 'animate-spin motion-reduce:animate-none' : undefined} />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ts: number, locale: string): string {
  return new Date(ts).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeOf(ts: number, locale: string): string {
  return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
