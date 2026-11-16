'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutoGrow } from '@/shared/hooks/useAutoGrow';
import { offerPhotosCopy } from '@/shared/i18n/messages/offerPhotos';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
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
import { ConversationList } from './ConversationList';
import { PickUpLine } from './PickUpLine';
import { peekReturn, takeReturn } from './assistantReturn';
import { suggestedQuestions } from './suggestedQuestions';
import { LiveAman } from '@/shared/guide/LiveAman';
import { guideCopy } from '@/shared/i18n/messages/guide';
import { routeTitlesCopy } from '@/shared/i18n/messages/routeTitles';
import { routeTitleKey } from '@/shared/seo/routeTitle';
import { takeAsk } from './carriedAsk';
import { conversationToResume, NEW_CHAT, readOpenConversation, rememberOpenConversation } from './resumeConversation';
import { useAuth } from '@/shared/hooks/useAuth';
import { pastedFile } from '@/shared/utils/pastedFile';
import { enterSends, touchKeyboard } from '@/shared/utils/enterSends';
import { isDraftCaption, isOfferCaption } from '@/shared/assistant/offerCaption';

const ATTACHABLE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

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
    onNeedsHuman: (transcript) => callPerson(transcript.map((message) => ({ role: message.role, content: message.content }))),
  });
  const [input, setInput] = useState('');
  const askRef = useAutoGrow(input);
  // A chosen, pasted or dropped file waits in the box, like a picture in a
  // chat app, and goes with the words on Send.
  const [staged, setStaged] = useState<File | null>(null);
  const [stagedUrl, setStagedUrl] = useState<string | null>(null);
  const take = (file: File) => setStaged(file);
  useEffect(() => {
    if (!staged?.type.startsWith('image/')) { setStagedUrl(null); return; }
    const url = URL.createObjectURL(staged);
    setStagedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [staged]);
  const { locale } = useLocale();
  const photoCopy = offerPhotosCopy[locale];
  const aman = guideCopy[locale];
  // Where the assistant was opened from: Back goes there, and the questions fit it.
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  useEffect(() => setCameFrom(peekReturn()), []);
  const fromKey = cameFrom ? routeTitleKey(cameFrom.split(/[?#]/)[0] ?? '/', '') : null;
  const fromPage = fromKey && fromKey !== 'server' ? routeTitlesCopy[locale][fromKey] : null;
  const questions = suggestedQuestions(cameFrom).map((key) => aman.questions[key]);
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
  // What was left unfinished, after a break (view 66). Read once per visit.
  const pickUp = useQuery({ queryKey: ['assistant', 'pick-up'], queryFn: () => api.assistantPickUp().then((r) => r.pickUp), staleTime: Infinity, retry: false });
  const [pickUpGone, setPickUpGone] = useState(false);

  // A newly saved conversation joins the column.
  useEffect(() => {
    if (chat.conversationId) void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  }, [chat.conversationId, queryClient]);

  // A question asked on Home starts its own conversation instead.
  const { address } = useAuth();
  const resumed = useRef(false);
  const chatSend = chat.send;
  useEffect(() => {
    if (resumed.current) return;
    const asked = takeAsk();
    if (!asked) return;
    resumed.current = true;
    void chatSend(asked);
  }, [chatSend]);

  // Coming back reopens the conversation you were in; a new chat is your call.
  const chatOpen = chat.open;
  useEffect(() => {
    if (resumed.current || !list.data || chat.conversationId || chat.messages.length > 0) return;
    resumed.current = true;
    const id = conversationToResume(list.data, readOpenConversation(address));
    if (id) void chatOpen(id).catch(() => setOpenError(true));
  }, [list.data, address, chat.conversationId, chat.messages.length, chatOpen]);
  useEffect(() => {
    if (chat.conversationId) rememberOpenConversation(address, chat.conversationId);
  }, [address, chat.conversationId]);

  // Where the requests posted here stand, read again while the page is open, so
  // an agreed deal or a ready shortlist shows up without reloading (view 30).
  const refreshLive = chat.refreshLive;
  useEffect(() => {
    if (!chat.conversationId) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refreshLive();
    };
    const timer = setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [chat.conversationId, refreshLive]);

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
  const empty = chat.messages.length === 0;
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
  // Without a name the greeting drops it with its stop.
  const greeting = name ? aman.greeting.replace('{name}', name) : aman.greeting.replace(/^[^{]*\{name\}[.。।،]?\s*/, '');
  const mood = chat.busy ? 'thinking' : empty ? 'waiting' : 'idle';
  // Aman looks down at the box while something is typed to it (view 57, 15 Nov evening).
  const look = input.trim() ? { x: 0, y: 1 } : 'pointer';
  const back = () => router.push(takeReturn());

  async function send(text: string) {
    const question = text.trim();
    if (chat.busy) return;
    if (staged) {
      const file = staged;
      setStaged(null);
      setInput('');
      // Words about a request or a deal keep it for that (view 56), words
      // about selling make it an offer photo. Anything else, a photo alone
      // included, goes the way a file sent on Telegram goes (view 66): the
      // assistant sees what it shows and places it from the conversation, or asks.
      if (isDraftCaption(question)) await chat.attach(file, 'draft', question);
      else if (file.type.startsWith('image/') && isOfferCaption(question)) await chat.attach(file, 'offer', question);
      else await chat.attach(file, 'auto', question);
      return;
    }
    if (!question) return;
    setInput('');
    setPickUpGone(true);
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
    rememberOpenConversation(address, NEW_CHAT);
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  }

  const column = (
    <ConversationList list={list.data ?? []} currentId={chat.conversationId} onNew={() => void startNew()} onOpen={(id) => void openConversation(id)} onRemove={(id) => { setListOpen(false); setRemoveError(false); setRemoveId(id); }} />
  );
  return (
    <div className="flex min-h-[calc(100svh-var(--lp-nav-h,68px))] w-full text-[var(--ink)]">
      <aside className="hidden w-[300px] shrink-0 border-e border-[var(--line)] px-4 py-5 lg:block">
        <div className="sticky top-[calc(var(--lp-nav-h,72px)+20px)]">{column}</div>
      </aside>

      {/* On wide screens the column sits in the middle of the window, not just beside the list. */}
      <section className="flex min-w-0 flex-1 flex-col xl:pe-[300px]">
        {/* The top bar (view 57, Figma board 4): Back to where it was opened, Aman, and the conversations. */}
        <div className="flex items-center gap-2 px-3 pt-3 sm:px-5">
          <button type="button" onClick={back} aria-label={messages.nav.backAria} className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
            <Icon name="arrow-left" size={20} directional />
          </button>
          <span className="flex min-w-0 items-center gap-2 ps-1">
            <LiveAman size={30} mood={mood} look={look} seed="assistant-top" />
            <span className="guide-voice text-[18px] font-bold">{aman.label}</span>
          </span>
          <span className="ms-auto flex items-center gap-1">
            {chat.conversationId ? (
              <button type="button" onClick={() => { setRemoveError(false); setRemoveId(chat.conversationId); }} aria-label={t.remove} className="grid size-11 place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--raised)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
              </button>
            ) : null}
            <button type="button" onClick={() => void startNew()} aria-label={t.newConversation} className="grid size-11 place-items-center rounded-full text-[var(--ink)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] lg:hidden">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button type="button" onClick={() => setListOpen(true)} aria-label={t.conversations} className="grid size-11 place-items-center rounded-full border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] lg:hidden">
              <Icon name="list" size={20} />
            </button>
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-3 px-4 pb-4 pt-6 sm:px-0 sm:pt-8">
          {empty ? (
            <m.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: ease.out }} className="flex flex-col items-center pt-6 text-center sm:pt-12">
              <LiveAman size={96} mood={mood} look={look} seed="assistant-empty" />
              <h1 className="guide-voice mt-5 text-[26px] font-bold tracking-[-0.01em] sm:text-[30px]">{greeting}</h1>
              <p className="mt-2 max-w-[44ch] text-[15px] font-medium text-[var(--ink-secondary)]">{t.greetingBody}</p>
              {fromPage ? (
                <span data-assistant-from className="mt-4 inline-flex min-h-8 items-center rounded-full bg-[var(--raised)] px-3 text-[13px] font-semibold text-[var(--ink-secondary)]">
                  {aman.from.replace('{page}', fromPage)}
                </span>
              ) : null}
              <div data-assistant-questions className="mt-6 flex w-full flex-col items-stretch gap-2 sm:items-center">
                {questions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    disabled={chat.busy}
                    className="min-h-11 rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--raised)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </m.div>
          ) : (
            <div ref={threadRef}>
              <AssistantThread messages={chat.messages} busy={chat.busy} wait={chat.wait} from={cameFrom} onNavigate={() => undefined} />
            </div>
          )}
          {openError ? <p role="alert" className="border-s-2 border-[var(--color-critical)] ps-3 text-[14px]">{t.loadError}</p> : null}
          {chat.error ? <p role="alert" className="border-s-2 border-[var(--color-critical)] ps-3 text-[14px]">{chat.error}</p> : null}
          {/* Clears the composer, so the newest line is never under it. */}
          <div ref={endRef} className="scroll-mb-40" />
        </div>

        <div className="sticky bottom-0 bg-[var(--canvas)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <div className="relative mx-auto max-w-[640px]">
            {!empty && !atLatest ? (
              <button
                type="button"
                onClick={() => toLatest(true)}
                aria-label={t.jumpLatest}
                className="absolute -top-14 start-1/2 grid size-11 -translate-x-1/2 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] rtl:translate-x-1/2"
              >
                <Icon name="arrow-down" size={20} />
              </button>
            ) : null}
            {pickUp.data && !pickUpGone ? (
              <PickUpLine
                pickUp={pickUp.data}
                busy={chat.busy}
                onDismiss={() => setPickUpGone(true)}
                onContinue={() => {
                  setPickUpGone(true);
                  void openConversation(pickUp.data!.conversationId);
                }}
              />
            ) : null}
            {staged ? (
              <div className="mb-2 flex items-center gap-2 px-1">
                {stagedUrl ? (
                  <img src={stagedUrl} alt={staged.name} className="size-16 rounded-[12px] border border-[var(--line)] object-cover" />
                ) : (
                  <span className="inline-flex min-h-11 max-w-[60%] items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] font-medium text-[var(--ink)]">
                    <span className="truncate">{staged.name}</span>
                  </span>
                )}
                <button type="button" onClick={() => setStaged(null)} aria-label={photoCopy.removeTemplate.replace('{n}', '1')} className="grid size-11 place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
                  <Icon name="close" size={16} />
                </button>
              </div>
            ) : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
              onDrop={(e) => {
                const i = pastedFile(e.dataTransfer, ATTACHABLE, { preferText: false });
                if (i === null) return;
                e.preventDefault();
                take(e.dataTransfer.files[i]!);
              }}
              className="flex items-end gap-2 rounded-[28px] border border-[var(--line)] bg-[var(--surface)] py-1.5 pe-1.5 ps-2 focus-within:border-[var(--line-strong)]"
            >
              <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--raised)] hover:text-[var(--ink)] focus-within:ring-2 focus-within:ring-[var(--ink)]">
                <span className="sr-only">{t.attach}</span>
                <Icon name="image-plus" size={20} />
                <input
                  type="file"
                  accept={ATTACHABLE.join(',')}
                  className="sr-only"
                  disabled={chat.busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) take(file);
                    askRef.current?.focus();
                  }}
                />
              </label>
              <label htmlFor="assistant-ask" className="sr-only">{aman.box}</label>
              <textarea
                ref={askRef}
                id="assistant-ask"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  if (chat.busy) return;
                  const i = pastedFile(e.clipboardData, ATTACHABLE);
                  if (i === null) return;
                  e.preventDefault();
                  take(e.clipboardData.files[i]!);
                }}
                onKeyDown={(e) => {
                  if (enterSends({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing }, touchKeyboard())) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                dir="auto"
                placeholder={aman.box}
                className="max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
              />
              <button
                type="submit"
                disabled={chat.busy || (!input.trim() && !staged)}
                aria-label={messages.assistant.send}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--karwan-green)] text-[var(--accent-ink)] transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              >
                <Icon name="return" size={20} directional />
              </button>
            </form>
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                data-talk-to-person
                onClick={() => callPerson(chat.messages.map((message) => ({ role: message.role, content: message.content })))}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              >
                <Icon name="user" size={16} />
                {aman.person}
              </button>
            </div>
          </div>
        </div>
      </section>

      <ConfirmSheetShell open={removeId !== null} labelledBy="remove-conversation" busy={removing} onClose={() => setRemoveId(null)}>
        <h2 id="remove-conversation" className="text-[20px] font-semibold text-[var(--ink)]">{t.removeTitle}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{t.removeBody}</p>
        {removeError ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{t.removeFailed}</p> : null}
        <div className="mt-5 grid gap-2">
          <button type="button" disabled={removing} onClick={() => void removeConversation()} className="min-h-12 rounded-full bg-[var(--color-critical)] px-5 text-[15px] font-semibold text-white disabled:opacity-50">
            {t.remove}
          </button>
          <button type="button" disabled={removing} onClick={() => setRemoveId(null)} className="min-h-12 rounded-full border border-[var(--line)] px-5 text-[15px] font-semibold text-[var(--ink)] hover:bg-[var(--raised)] disabled:opacity-50">
            {t.removeKeep}
          </button>
        </div>
      </ConfirmSheetShell>

      <AnimatePresence>
        {listOpen ? (
          <m.div
            key="list"
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={() => setListOpen(false)}
          >
            <m.div
              role="dialog"
              aria-modal="true"
              aria-label={t.conversations}
              className="absolute inset-x-0 bottom-0 max-h-[80svh] overflow-y-auto rounded-t-[22px] bg-[var(--surface)] p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
              initial={reduce ? false : { y: 40 }}
              animate={{ y: 0 }}
              exit={reduce ? undefined : { y: 40 }}
              transition={{ duration: 0.26, ease: ease.out }}
              onClick={(e) => e.stopPropagation()}
            >
              {column}
            </m.div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
