'use client';
import { HELP_OPEN_EVENT, type HelpOpenDetail } from '@/shared/assistant/openHelp';
import { AssistantThread, Bubble, Dot, confirmOutcomes } from '@/shared/assistant/AssistantThread';
import { useAssistantChat } from '@/shared/assistant/useAssistantChat';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api, ApiError } from '@/core/api';
import { stripMarkdown } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import {
  useFloatingClearance,
  floatingClearanceStyle,
} from '@/shared/hooks/useFloatingClearance';
import { useAuth } from '@/shared/hooks/useAuth';
import { isAssistantRoute, isPublicEditorialRoute } from '@/shared/utils/routes';
import { Icon } from '@/shared/components/Icon';

interface LiveMsg {
  role: 'user' | 'assistant' | 'operator' | 'system';
  text: string;
  ts: number;
}

const POLL_MS = 4000;
// Slower poll of the user's own ticket while the widget is closed, so a reply
// that lands while they're away badges the launcher without a heavy live feed.
const BG_POLL_MS = 20000;
// The live ticket id is remembered here so a refresh restores the chat.
const SUPPORT_STORAGE_KEY = 'karwan.support.convo';

/// In-app support assistant. A floating launcher opens a chat panel that talks
/// to /api/assistant/chat. The model is grounded in the Karwan knowledge base
/// and answers with in-app links, so it doubles as guidance and support. It is
/// read-only: it never touches funds or the user's account.
///
/// When a human operator channel is configured, the panel also offers a
/// "Talk to a human" handoff: it opens a support conversation, relays it to an
/// operator over Telegram, and polls for the replies. The AI history stays
/// visible above the live thread so the operator's context is the user's too.
export function AssistantWidget() {
  const a11y = useTranslations().a11y;
  const t = useTranslations().assistant;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /// Fold the launcher away while it would sit on top of a control.
  const clearance = useFloatingClearance('end');
  const [expanded, setExpanded] = useState(false);
  const auth = useAuth();
  const [input, setInput] = useState('');
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [handoffEnabled, setHandoffEnabled] = useState<boolean | null>(null);
  // True once the person asked for someone or the assistant cannot do it
  // (owner, 20 Oct 2026). A person is then brought in without a button.
  const [humanSuggested, setHumanSuggested] = useState(false);
  const autoTriedRef = useRef(false);
  const suggestHuman = useCallback(() => setHumanSuggested(true), []);
  const chat = useAssistantChat({ onNeedsHuman: suggestHuman, mode: 'help' });
  const turns = chat.messages;
  const loading = liveLoading || chat.busy;
  const error = liveError ?? chat.error;
  const [convoId, setConvoId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveMsg[]>([]);
  const [liveClosed, setLiveClosed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [unread, setUnread] = useState(false);

  // Any screen can open Help, with a question already typed (shared/assistant/openHelp.ts).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<HelpOpenDetail>).detail ?? {};
      setOpen(true);
      if (detail.prefill) setInput(detail.prefill);
      // Assistant mode asked for a person: carry its conversation over.
      if (detail.person) {
        if (detail.transcript?.length) chat.reset(detail.transcript);
        setHumanSuggested(true);
      }
    };
    window.addEventListener(HELP_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(HELP_OPEN_EVENT, onOpen);
  }, []);
  const lastTsRef = useRef(0);
  const pollBusyRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, turns, live, loading, liveClosed]);

  // Account switch on the same tab (sign-out does not reload the page): the
  // transcript and the confirm-outcome store belong to the previous identity —
  // balances, deals, and tx receipts must never carry over to the next user.
  const prevAddressRef = useRef<string | null>(null);
  useEffect(() => {
    const next = auth.address?.toLowerCase() ?? null;
    if (prevAddressRef.current !== null && prevAddressRef.current !== next) {
      confirmOutcomes.clear();
      chat.reset();
      setLiveError(null);
    }
    prevAddressRef.current = next;
  }, [auth.address]);

  // Probe once whether a human operator channel is wired. The handoff button
  // only appears when it is.
  useEffect(() => {
    if (!open || handoffEnabled !== null) return;
    let cancelled = false;
    api
      .supportStatus()
      .then((r) => !cancelled && setHandoffEnabled(r.enabled))
      .catch(() => !cancelled && setHandoffEnabled(false));
    return () => {
      cancelled = true;
    };
  }, [open, handoffEnabled]);

  // Restore a live ticket after a refresh so the user doesn't lose the chat
  // until they end it. Loads the full thread on the next poll (cursor at 0).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(SUPPORT_STORAGE_KEY);
    if (saved) {
      lastTsRef.current = 0;
      setLive([]);
      setLiveClosed(false);
      setHumanSuggested(true);
      setConvoId(saved);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollLive = useCallback(async () => {
    if (!convoId || pollBusyRef.current) return;
    pollBusyRef.current = true;
    try {
      const r = await api.supportPoll(convoId, lastTsRef.current);
      if (r.messages.length > 0) {
        lastTsRef.current = Math.max(lastTsRef.current, ...r.messages.map((m) => m.ts));
        setLive((prev) => [...prev, ...r.messages]);
        // A reply that arrives while the widget is closed badges the launcher.
        if (!openRef.current && r.messages.some((m) => m.role === 'operator')) {
          setUnread(true);
        }
      }
      if (r.status === 'closed') {
        setLiveClosed(true);
        if (typeof window !== 'undefined') window.localStorage.removeItem(SUPPORT_STORAGE_KEY);
      }
    } catch {
      /* transient network blip; the next tick retries */
    } finally {
      pollBusyRef.current = false;
    }
  }, [convoId]);

  // Poll the ticket: fast while open, slow in the background while closed (so a
  // reply still surfaces). Stops once the ticket closes.
  useEffect(() => {
    if (!convoId || liveClosed) return;
    if (open) void pollLive();
    const id = setInterval(() => void pollLive(), open ? POLL_MS : BG_POLL_MS);
    return () => clearInterval(id);
  }, [open, convoId, liveClosed, pollLive]);

  // Bring a person in as soon as it is needed and the channel is known to be on.
  // One automatic try; a failure shows the button to try again.
  useEffect(() => {
    if (!humanSuggested || handoffEnabled !== true || convoId !== null || loading || autoTriedRef.current) return;
    autoTriedRef.current = true;
    void startHandoff();
  });

  async function startHandoff() {
    if (loading || convoId) return;
    setLiveError(null);
    chat.setError(null);
    setLiveLoading(true);
    try {
      const transcript = turns.map((m) => ({ role: m.role, content: m.content }));
      const res = await api.supportStart(transcript);
      lastTsRef.current = res.at;
      setLive([]);
      setLiveClosed(false);
      setConvoId(res.conversationId);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SUPPORT_STORAGE_KEY, res.conversationId);
      }
    } catch (e) {
      setLiveError(e instanceof ApiError ? e.message : t.error);
    } finally {
      setLiveLoading(false);
    }
  }

  async function endChat() {
    if (!convoId) return;
    try {
      await api.supportClose(convoId);
    } catch {
      /* the sweeper closes + archives it regardless */
    }
    setLiveClosed(true);
    if (typeof window !== 'undefined') window.localStorage.removeItem(SUPPORT_STORAGE_KEY);
  }

  function resetToAssistant() {
    autoTriedRef.current = false;
    setConvoId(null);
    setLive([]);
    setLiveClosed(false);
    setHumanSuggested(false);
    setUnread(false);
    lastTsRef.current = 0;
    if (typeof window !== 'undefined') window.localStorage.removeItem(SUPPORT_STORAGE_KEY);
  }

  async function send(question?: string) {
    const text = (question ?? input).trim();
    if (!text || loading) return;

    // Live (human) mode: relay to the operator, then poll so the user's own
    // line and any reply surface from the single server source of truth.
    if (convoId) {
      if (liveClosed) return;
      setInput('');
      setLiveError(null);
      setLiveLoading(true);
      try {
        await api.supportSend(convoId, text);
        await pollLive();
      } catch (e) {
        setLiveError(e instanceof ApiError ? e.message : t.error);
      } finally {
        setLiveLoading(false);
      }
      return;
    }

    // AI mode.
    setInput('');
    setLiveError(null);
    await chat.send(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isLive = convoId !== null;
  // The automatic start already ran and did not connect: let them try again.
  const showHandoffButton = handoffEnabled === true && !isLive && humanSuggested && autoTriedRef.current && !loading;
  // No live support channel: the feedback page is how a person is reached.
  const showFeedbackLink = handoffEnabled === false && humanSuggested;

  // The Ask launcher never shows on the landing/marketing pages, and never
  // before sign-in: the assistant answers from the caller's own balances and
  // deals and can prepare money actions, none of which mean anything without a
  // session, and the backend now refuses anonymous calls outright. Waiting on
  // isLoading avoids flashing the launcher during the web3 reconnect window
  // and then pulling it away. Hooks above all run either way so the poll state
  // stays intact once the user does sign in.
  // Assistant mode is the assistant, so its launcher would sit over the
  // composer; the panel still opens there when the assistant asks for a person.
  if (isPublicEditorialRoute(pathname)) return null;
  if (isAssistantRoute(pathname) && !open) return null;
  if (auth.isLoading || !auth.isAuthenticated) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setUnread(false);
            setOpen(true);
          }}
          aria-label={t.launcherAria}
          data-float-launcher
          data-float-side="end"
          className="fixed z-[60] end-4 bottom-24 inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-[var(--lp-dark)] px-5 text-[14px] font-semibold text-[var(--lp-light)] shadow-[0_10px_28px_-12px_rgba(0,0,0,0.5)] transition-transform hover:-translate-y-0.5 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 md:end-5 md:bottom-5"
          style={floatingClearanceStyle(clearance)}
        >
          {unread && (
            <span
              aria-label={a11y.newReply}
              className="absolute -top-1.5 -end-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[var(--lp-critical)] text-white text-[13px] font-bold leading-none"
            >
              1
            </span>
          )}
          <span aria-hidden className="-ms-1.5 grid size-[26px] place-items-center rounded-full bg-[var(--lp-light)] text-[15px] font-bold leading-none text-[var(--lp-dark)]">?</span>
          <span>
            {unread ? a11y.newReply : t.launcherLabel}
          </span>
        </button>
      )}

      {open && (
        <div
          className={
            'fixed z-[70] inset-x-0 bottom-0 sm:inset-x-auto sm:end-5 sm:bottom-5 flex flex-col bg-[var(--lp-card)] border border-[var(--lp-border-light)] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.45)] max-h-[calc(100vh-1rem)] transition-[width,height] duration-200 ' +
            (expanded
              ? 'h-[86vh] sm:w-[560px] sm:h-[760px]'
              : 'h-[76vh] sm:w-[440px] sm:h-[640px]')
          }
          style={{
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          }}
          role="dialog"
          aria-label={t.title}
        >
          {/* header */}
          <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--lp-border-light)]">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src="/brand/karwan-mark-lime.svg" alt="" aria-hidden width={30} height={30} className="size-[30px] shrink-0" />
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-[var(--lp-dark)]">{t.title}</p>
                <p className="mt-0.5 truncate text-[14px] text-[var(--lp-text-sub)] font-medium">{t.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? 'Shrink' : 'Expand'}
                className="hidden sm:inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] hover:bg-black/[0.05] transition-colors"
              >
                {expanded ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M6 2v4H2M10 14v-4h4M2 10h4v4M14 6h-4V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M2 6V2h4M14 10v4h-4M2 10v4h4M14 6V2h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] hover:bg-black/[0.05] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 space-y-3">
            <Bubble role="assistant">{t.greeting}</Bubble>
            {turns.length === 0 && !isLive ? (
              <div className="flex flex-wrap gap-2 ps-8">
                {t.suggestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void send(question)}
                    disabled={loading}
                    className="min-h-9 rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 text-[14px] text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-outline-strong)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                  >
                    {question}
                  </button>
                ))}
              </div>
            ) : null}
            <AssistantThread messages={turns} busy={false} onNavigate={() => setOpen(false)} />
            {isLive && (
              <>
                <div className="flex items-center gap-2 pt-1">
                  <span className="h-px flex-1 bg-[var(--lp-border-light)]" />
                  <span className="mono text-[13px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
                    {t.liveHeader}
                  </span>
                  <span className="h-px flex-1 bg-[var(--lp-border-light)]" />
                </div>
                {convoId && (
                  <p className="mono text-[13px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] text-center">
                    Ticket {convoId}
                  </p>
                )}
                {!liveClosed && (
                  <p className="mono text-[13px] leading-snug text-[var(--lp-text-sub)] px-1">
                    {t.liveBanner ??
                      'Connected to support. A person will reply here, usually within a few minutes.'}
                  </p>
                )}
                {live.map((m, i) => (
                  <div key={`l${i}`}>
                    {m.role === 'operator' && (
                      <p className="mono text-[13px] uppercase tracking-[0.14em] text-[var(--lp-accent)] mb-1 ms-1">
                        {t.operatorName}
                      </p>
                    )}
                    <Bubble role={m.role === 'user' ? 'user' : 'assistant'}>
                      {m.role === 'user' ? m.text : stripMarkdown(m.text)}
                    </Bubble>
                  </div>
                ))}
                {liveClosed && (
                  <p className="mono text-[13px] leading-snug text-[var(--lp-text-muted)] px-1 pt-1">
                    {t.liveClosed ??
                      'This support chat is closed. The transcript was emailed to you.'}
                  </p>
                )}
              </>
            )}
            {loading && (
              <Bubble role="assistant">
                <span className="inline-flex gap-1" aria-label="Thinking">
                  <Dot /> <Dot /> <Dot />
                </span>
              </Bubble>
            )}
            {error && (
              <p className="mono text-[14px] text-[var(--lp-critical)] px-1">{error}</p>
            )}
          </div>

          {/* input */}
          <div className="p-3 border-t border-[var(--lp-border-light)]">
            {showFeedbackLink && (
              <Link
                href="/feedback"
                className="mb-2 flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-medium text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-light)]"
              >
                {t.humanButton}
              </Link>
            )}
            {showHandoffButton && (
              <button
                type="button"
                onClick={startHandoff}
                disabled={loading}
                className="mb-2 min-h-11 w-full rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-medium text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-light)] disabled:opacity-50"
              >
                {t.humanButton}
              </button>
            )}
            {isLive && !liveClosed && (
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={endChat}
                  className="mono text-[13px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition"
                >
                  {t.endChat}
                </button>
              </div>
            )}
            {liveClosed ? (
              <button
                type="button"
                onClick={resetToAssistant}
                className="w-full mono text-[14px] uppercase tracking-[0.1em] font-bold px-3 py-2.5 rounded-[10px] bg-[var(--lp-dark)] text-[var(--lp-bg)] transition"
              >
                {t.backToAssistant}
              </button>
            ) : (
              <>
                <div className="flex items-end gap-2 rounded-[22px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] py-1.5 pe-1.5 ps-4 focus-within:border-[var(--lp-outline-strong)]">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={isLive ? t.livePlaceholder : t.placeholder}
                    rows={1}
                    aria-label={isLive ? t.livePlaceholder : t.placeholder}
                    className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] text-[var(--lp-dark)] outline-none placeholder:text-[var(--lp-text-muted)]"
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={loading || !input.trim()}
                    aria-label={t.send}
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[#10170b] transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]"
                  >
                    <Icon name="send" size={20} />
                  </button>
                </div>
                {!isLive && auth.isAuthenticated ? (
                  <p className="mt-2 text-center text-[14px] text-[var(--lp-text-muted)]">{t.confirmNote}</p>
                ) : null}
                {/* Guidance disclaimer is only true for signed-OUT visitors (the
                    assistant holds no tools for them). Once signed in it CAN act
                    (each action still gated by a confirm card), so the line would
                    be wrong — hide it. */}
                {!isLive && !auth.isAuthenticated && (
                  <p className="mono text-[13px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] mt-2 leading-snug">
                    {t.disclaimer}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

