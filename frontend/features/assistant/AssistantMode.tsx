'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutoGrow } from '@/shared/hooks/useAutoGrow';
import { offerPhotosCopy } from '@/shared/i18n/messages/offerPhotos';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '@/core/api';
import { AssistantThread } from '@/shared/assistant/AssistantThread';
import { callPerson } from '@/shared/assistant/openHelp';
import { useAssistantChat } from '@/shared/assistant/useAssistantChat';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { Icon } from '@/shared/components/Icon';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ease } from '@/shared/motion/tokens';
import { greetingKey } from './conversationGroups';
import { ConversationList } from './ConversationList';
import { takeReturn } from './assistantReturn';

const LIST_KEY = ['assistant-conversations'];

/// Assistant mode (view 19): the account run from one conversation, with the
/// saved conversations beside it. The same thread and cards as Help.
export function AssistantMode() {
  const t = useTranslations().profile.signInGate;
  return (
    <AuthGuard gateTag={t.tag} gateBody={t.body}>
      <AssistantPage />
    </AuthGuard>
  );
}

function AssistantPage() {
  const messages = useTranslations();
  const t = messages.assistantMode;
  const router = useRouter();
  const reduce = useHydratedReducedMotion();
  const queryClient = useQueryClient();
  const { profile } = useUserProfile();
  const chat = useAssistantChat({
    persist: true,
    mode: 'assistant',
    onNeedsHuman: (transcript) => callPerson(transcript.map((m) => ({ role: m.role, content: m.content }))),
  });
  const [input, setInput] = useState('');
  const askRef = useAutoGrow(input);
  const [photoChoice, setPhotoChoice] = useState<File | null>(null);
  const { locale } = useLocale();
  const photoCopy = offerPhotosCopy[locale];
  const [listOpen, setListOpen] = useState(false);
  const [openError, setOpenError] = useState(false);
  /// The conversation waiting for a delete confirmation: the open one or any in the list.
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  /// The reader is at the newest message. While they are, a growing reply keeps
  /// them there; once they scroll up, nothing pulls them back and the jump
  /// button appears instead.
  const [atLatest, setAtLatest] = useState(true);
  const atLatestRef = useRef(true);
  const list = useQuery({ queryKey: LIST_KEY, queryFn: () => api.assistantConversations().then((r) => r.conversations) });

  // A newly saved conversation joins the column.
  useEffect(() => {
    if (chat.conversationId) void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  }, [chat.conversationId, queryClient]);

  const toLatest = useCallback((smooth: boolean) => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }, [reduce]);

  useEffect(() => {
    const end = endRef.current;
    if (!end) return;
    const seen = new IntersectionObserver(([entry]) => {
      const visible = !!entry?.isIntersecting;
      atLatestRef.current = visible;
      setAtLatest(visible);
    });
    seen.observe(end);
    return () => seen.disconnect();
  }, []);

  // A message you just sent is always brought into view; a new reply only when
  // you were already at the newest message.
  const last = chat.messages[chat.messages.length - 1];
  const hasThread = chat.messages.length > 0;
  useEffect(() => {
    if (last?.role === 'user' || atLatestRef.current) toLatest(true);
  }, [chat.messages.length, chat.busy, last?.role, toLatest]);

  // A reply that grows after it lands (cards, images) keeps a reader at the bottom.
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const grow = new ResizeObserver(() => {
      if (atLatestRef.current) toLatest(false);
    });
    grow.observe(thread);
    return () => grow.disconnect();
  }, [toLatest, hasThread]);

  // Escape switches assistant mode off, back to where it was switched on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !listOpen) router.push(takeReturn());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, listOpen]);

  const name = profile?.handle ? `@${profile.handle}` : (profile?.displayName ?? '').trim().split(/\s+/)[0] ?? '';
  const template = t[greetingKey(new Date().getHours())];
  // Without a name the greeting drops it with its comma.
  const greeting = name ? template.replace('{name}', name) : template.replace(/[,،]\s*\{name\}/, '');

  async function send(text: string) {
    const question = text.trim();
    if (!question || chat.busy) return;
    setInput('');
    await chat.send(question);
  }

  async function openConversation(id: string) {
    setListOpen(false);
    setOpenError(false);
    try {
      await chat.open(id);
    } catch {
      setOpenError(true);
    }
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  }

  async function removeConversation() {
    setRemoving(true);
    setRemoveError(false);
    try {
      // The open conversation also clears the screen; another one only leaves the list.
      if (removeId === chat.conversationId) await chat.remove();
      else if (removeId) await api.deleteAssistantConversation(removeId);
      setRemoveId(null);
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    } catch {
      setRemoveError(true);
    } finally {
      setRemoving(false);
    }
  }

  async function startNew() {
    setListOpen(false);
    setOpenError(false);
    await chat.startNew();
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  }

  const column = (
    <ConversationList list={list.data ?? []} currentId={chat.conversationId} onNew={() => void startNew()} onOpen={(id) => void openConversation(id)} onRemove={(id) => { setListOpen(false); setRemoveError(false); setRemoveId(id); }} />
  );
  const empty = chat.messages.length === 0;

  return (
    <div className="flex min-h-[calc(100svh-var(--lp-nav-h,68px))] w-full text-[var(--lp-dark)]">
      <aside className="hidden w-[264px] shrink-0 border-e border-[var(--lp-border-light)] px-4 py-5 lg:block">
        <div className="sticky top-[calc(var(--lp-nav-h,72px)+20px)]">{column}</div>
      </aside>

      {/* On wide screens the column sits in the middle of the window, not just beside the list. */}
      <section className="flex min-w-0 flex-1 flex-col xl:pe-[264px]">
        <div className="flex items-center justify-between gap-2 px-4 pt-3 lg:hidden">
          <button type="button" onClick={() => setListOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[15px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h10" /></svg>
            {t.conversations}
          </button>
          <button type="button" onClick={() => void startNew()} aria-label={t.newConversation} className="grid size-11 place-items-center rounded-full text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-3 px-4 pb-4 pt-6 sm:px-6 sm:pt-8">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => callPerson(chat.messages.map((m) => ({ role: m.role, content: m.content })))}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              <Icon name="user" size={20} />
              {messages.assistant.humanButton}
            </button>
            {chat.conversationId ? (
              <button type="button" onClick={() => { setRemoveError(false); setRemoveId(chat.conversationId); }} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[14px] font-semibold text-[var(--lp-text-sub)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                {t.remove}
              </button>
            ) : null}
          </div>
          {empty ? (
            <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: ease.out }} className="pt-6 sm:pt-12">
              <h1 className="text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">{greeting}</h1>
              <p className="mt-2 max-w-[52ch] text-[15px] font-medium text-[var(--lp-text-sub)]">{t.greetingBody}</p>
            </motion.div>
          ) : (
            <div ref={threadRef}>
              <AssistantThread messages={chat.messages} busy={chat.busy} onNavigate={() => undefined} />
            </div>
          )}
          {openError ? <p role="alert" className="border-s-2 border-[var(--color-critical)] ps-3 text-[14px]">{t.loadError}</p> : null}
          {chat.error ? <p role="alert" className="border-s-2 border-[var(--color-critical)] ps-3 text-[14px]">{chat.error}</p> : null}
          {/* Clears the composer, so the newest line is never under it. */}
          <div ref={endRef} className="scroll-mb-40" />
        </div>

        <div className="sticky bottom-0 bg-[var(--lp-bg)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <div className="relative mx-auto max-w-[760px]">
            {!empty && !atLatest ? (
              <button
                type="button"
                onClick={() => toLatest(true)}
                aria-label={t.jumpLatest}
                className="absolute -top-14 start-1/2 grid size-11 -translate-x-1/2 place-items-center rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rtl:translate-x-1/2"
              >
                <Icon name="arrow-down" size={20} />
              </button>
            ) : null}
            {empty ? (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
                {t.chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => void send(chip)}
                    disabled={chat.busy}
                    className="min-h-11 shrink-0 rounded-full border border-[var(--lp-border-light)] bg-[var(--tint)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-light)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
            {photoChoice ? (
              <div role="group" aria-label={photoCopy.chooseTitle} className="mb-3 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-3">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 px-1 text-[14px] font-semibold text-[var(--lp-dark)]">{photoCopy.chooseTitle}</p>
                  <button type="button" onClick={() => setPhotoChoice(null)} aria-label={photoCopy.cancel} className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--lp-text-sub)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
                    <Icon name="close" size={20} />
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button type="button" disabled={chat.busy} onClick={() => { const file = photoChoice; setPhotoChoice(null); void chat.attach(file, 'offer'); }} className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] bg-[var(--tint)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
                    {photoCopy.forOffer}
                  </button>
                  <button type="button" disabled={chat.busy} onClick={() => { const file = photoChoice; setPhotoChoice(null); void chat.attach(file, 'invoice'); }} className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] bg-[var(--tint)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
                    {photoCopy.asInvoice}
                  </button>
                </div>
              </div>
            ) : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex items-end gap-2 rounded-[28px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] py-1.5 pe-1.5 ps-2 focus-within:border-[color-mix(in_srgb,var(--lp-accent)_60%,transparent)]"
            >
              <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--lp-text-sub)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] focus-within:ring-2 focus-within:ring-[var(--lp-accent)]">
                <span className="sr-only">{t.attach}</span>
                <Icon name="image-plus" size={20} />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="sr-only"
                  disabled={chat.busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    // A photo may be for an offer or an invoice; a PDF is an invoice.
                    if (file?.type.startsWith('image/')) setPhotoChoice(file);
                    else if (file) void chat.attach(file);
                  }}
                />
              </label>
              <label htmlFor="assistant-ask" className="sr-only">{t.placeholder}</label>
              <textarea
                ref={askRef}
                id="assistant-ask"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                dir="auto"
                placeholder={t.placeholder}
                className="max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[16px] text-[var(--lp-dark)] outline-none placeholder:text-[var(--lp-text-muted)]"
              />
              <button
                type="submit"
                disabled={chat.busy || !input.trim()}
                aria-label={messages.assistant.send}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--accent-ink)] transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]"
              >
                <Icon name="return" size={20} directional />
              </button>
            </form>
          </div>
        </div>
      </section>

      <ConfirmSheetShell open={removeId !== null} labelledBy="remove-conversation" busy={removing} onClose={() => setRemoveId(null)}>
        <h2 id="remove-conversation" className="text-[20px] font-semibold text-[var(--lp-dark)]">{t.removeTitle}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{t.removeBody}</p>
        {removeError ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{t.removeFailed}</p> : null}
        <div className="mt-5 grid gap-2">
          <button type="button" disabled={removing} onClick={() => void removeConversation()} className="min-h-12 rounded-full bg-[var(--color-critical)] px-5 text-[15px] font-semibold text-white disabled:opacity-50">
            {t.remove}
          </button>
          <button type="button" disabled={removing} onClick={() => setRemoveId(null)} className="min-h-12 rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-50">
            {t.removeKeep}
          </button>
        </div>
      </ConfirmSheetShell>

      <AnimatePresence>
        {listOpen ? (
          <motion.div
            key="list"
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={() => setListOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={t.conversations}
              className="absolute inset-x-0 bottom-0 max-h-[80svh] overflow-y-auto rounded-t-[22px] bg-[var(--lp-card)] p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
              initial={reduce ? false : { y: 40 }}
              animate={{ y: 0 }}
              exit={reduce ? undefined : { y: 40 }}
              transition={{ duration: 0.26, ease: ease.out }}
              onClick={(e) => e.stopPropagation()}
            >
              {column}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
