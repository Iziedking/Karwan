'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  type AssistantAction,
  type AssistantNavigateAction,
  type AssistantConfirmAction,
} from '@/core/api';
import { stripMarkdown } from '@/shared/utils/format';
import { ARC_EXPLORER_TX } from '@/features/profile/config';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useAuth } from '@/shared/hooks/useAuth';
import { isLandingRoute } from '@/shared/utils/routes';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /// Navigate buttons the authenticated assistant attached to this reply.
  actions?: AssistantAction[];
}

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
  const t = useTranslations().assistant;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const auth = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffEnabled, setHandoffEnabled] = useState<boolean | null>(null);
  // Only true once the assistant itself decides the issue needs a person, so
  // the handoff button stays hidden during ordinary Q&A and can't be spammed.
  const [humanSuggested, setHumanSuggested] = useState(false);
  const [convoId, setConvoId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveMsg[]>([]);
  const [liveClosed, setLiveClosed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [unread, setUnread] = useState(false);
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
      setTurns([]);
      setError(null);
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

  async function startHandoff() {
    if (loading || convoId) return;
    setError(null);
    setLoading(true);
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
      setError(e instanceof ApiError ? e.message : t.error);
    } finally {
      setLoading(false);
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
    setConvoId(null);
    setLive([]);
    setLiveClosed(false);
    setHumanSuggested(false);
    setUnread(false);
    lastTsRef.current = 0;
    if (typeof window !== 'undefined') window.localStorage.removeItem(SUPPORT_STORAGE_KEY);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    // Live (human) mode: relay to the operator, then poll so the user's own
    // line and any reply surface from the single server source of truth.
    if (convoId) {
      if (liveClosed) return;
      setInput('');
      setError(null);
      setLoading(true);
      try {
        await api.supportSend(convoId, text);
        await pollLive();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.error);
      } finally {
        setLoading(false);
      }
      return;
    }

    // AI mode.
    const next = [...turns, { role: 'user' as const, content: text }];
    setTurns(next);
    setInput('');
    setError(null);
    setLoading(true);
    try {
      const { reply, actions } = await api.assistantChat(next);
      // The assistant appends [[HUMAN]] only when it judges the issue needs a
      // person. Strip the marker from what we show and reveal the handoff.
      const needsHuman = /\[\[HUMAN\]\]/i.test(reply);
      const clean = reply.replace(/\[\[HUMAN\]\]/gi, '').trim();
      setTurns([...next, { role: 'assistant', content: clean, actions }]);
      if (needsHuman) setHumanSuggested(true);
    } catch (e) {
      // Map the backend's error codes to a human line instead of showing the
      // raw "assistant-error" string. The human fallback is revealed below.
      const code = e instanceof ApiError ? e.message : '';
      setError(
        code === 'assistant-timeout'
          ? 'The assistant took too long. Try again, or talk to a human below.'
          : code === 'assistant-unavailable'
            ? 'The assistant is offline right now. You can talk to a human below.'
            : code === 'assistant-error'
              ? 'The assistant hit a snag. Try again, or talk to a human below.'
              : t.error,
      );
      // A failed assistant call leaves the user stuck; offer a human as a
      // fallback so they aren't stranded.
      setHumanSuggested(true);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isLive = convoId !== null;
  const showHandoffButton = handoffEnabled === true && !isLive && humanSuggested;

  // The Ask launcher never shows on the landing/marketing pages. Hooks above all
  // run so its poll state stays intact when the user enters the app.
  if (isLandingRoute(pathname)) return null;

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
          className="fixed z-[60] end-4 sm:end-5 bottom-16 sm:bottom-20 inline-flex items-center gap-2 px-3 py-2.5 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] mono text-[11px] uppercase tracking-[0.12em] font-bold shadow-[0_8px_24px_-10px_rgba(0,0,0,0.45)] hover:brightness-105 transition"
          style={{
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          {unread && (
            <span
              aria-label="New reply"
              className="absolute -top-1 -end-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--lp-critical)] text-white text-[9px] font-bold"
            >
              1
            </span>
          )}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M8 1.5c-3.6 0-6.5 2.4-6.5 5.4 0 1.7.9 3.2 2.4 4.2-.1.8-.5 1.7-1.2 2.5 1.3-.1 2.5-.5 3.4-1.1.6.1 1.2.2 1.9.2 3.6 0 6.5-2.4 6.5-5.4S11.6 1.5 8 1.5z" />
          </svg>
          <span className="hidden sm:inline">{unread ? 'New reply' : t.launcherLabel}</span>
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
            <div>
              <p className="font-sans text-[15px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
                {t.title}
              </p>
              <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] mt-0.5">
                {t.subtitle}
              </p>
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
            {turns.map((m, i) => (
              <div key={i} className="space-y-2">
                <Bubble role={m.role}>
                  {m.role === 'assistant' ? (
                    <RichText text={m.content} onNavigate={() => setOpen(false)} />
                  ) : (
                    m.content
                  )}
                </Bubble>
                {m.role === 'assistant' && m.actions && m.actions.length > 0 && (
                  <ActionButtons actions={m.actions} onNavigate={() => setOpen(false)} />
                )}
              </div>
            ))}
            {isLive && (
              <>
                <div className="flex items-center gap-2 pt-1">
                  <span className="h-px flex-1 bg-[var(--lp-border-light)]" />
                  <span className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
                    {t.liveHeader ?? 'Live support'}
                  </span>
                  <span className="h-px flex-1 bg-[var(--lp-border-light)]" />
                </div>
                {convoId && (
                  <p className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] text-center">
                    Ticket {convoId}
                  </p>
                )}
                {!liveClosed && (
                  <p className="mono text-[10px] leading-snug text-[var(--lp-text-sub)] px-1">
                    {t.liveBanner ??
                      'Connected to support. A person will reply here, usually within a few minutes.'}
                  </p>
                )}
                {live.map((m, i) => (
                  <div key={`l${i}`}>
                    {m.role === 'operator' && (
                      <p className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-accent)] mb-1 ms-1">
                        {t.operatorName ?? 'Support'}
                      </p>
                    )}
                    <Bubble role={m.role === 'user' ? 'user' : 'assistant'}>
                      {m.role === 'user' ? m.text : stripMarkdown(m.text)}
                    </Bubble>
                  </div>
                ))}
                {liveClosed && (
                  <p className="mono text-[10px] leading-snug text-[var(--lp-text-muted)] px-1 pt-1">
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
              <p className="mono text-[11px] text-[var(--lp-critical)] px-1">{error}</p>
            )}
          </div>

          {/* input */}
          <div className="p-3 border-t border-[var(--lp-border-light)]">
            {showHandoffButton && (
              <button
                type="button"
                onClick={startHandoff}
                disabled={loading}
                className="w-full mb-2 mono text-[10px] uppercase tracking-[0.12em] font-bold px-3 py-2 rounded-[10px] border border-[var(--lp-border-light)] text-[var(--lp-dark)] hover:bg-black/[0.04] disabled:opacity-50 transition"
              >
                {t.humanButton ?? 'Talk to a human'}
              </button>
            )}
            {isLive && !liveClosed && (
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={endChat}
                  className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition"
                >
                  {t.endChat ?? 'End chat'}
                </button>
              </div>
            )}
            {liveClosed ? (
              <button
                type="button"
                onClick={resetToAssistant}
                className="w-full mono text-[11px] uppercase tracking-[0.1em] font-bold px-3 py-2.5 rounded-[10px] bg-[var(--lp-dark)] text-[var(--lp-bg)] transition"
              >
                {t.backToAssistant ?? 'Back to assistant'}
              </button>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={isLive ? t.livePlaceholder ?? 'Message support...' : t.placeholder}
                    rows={1}
                    className="form-input flex-1 resize-none max-h-28 text-[14px]"
                  />
                  <button
                    type="button"
                    onClick={send}
                    disabled={loading || !input.trim()}
                    className="shrink-0 mono text-[11px] uppercase tracking-[0.1em] font-bold px-3 py-2.5 bg-[var(--lp-dark)] text-[var(--lp-bg)] disabled:opacity-50 transition"
                    style={{
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 3,
                    }}
                  >
                    {t.send}
                  </button>
                </div>
                {/* Guidance disclaimer is only true for signed-OUT visitors (the
                    assistant holds no tools for them). Once signed in it CAN act
                    (each action still gated by a confirm card), so the line would
                    be wrong — hide it. */}
                {!isLive && !auth.isAuthenticated && (
                  <p className="mono text-[9px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] mt-2 leading-snug">
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

/// Renders the structured actions the authenticated assistant attached to a
/// reply, dispatching by kind: a navigate button routes to a screen, a confirm
/// card proposes a reversible write the user must approve.
function ActionButtons({
  actions,
  onNavigate,
}: {
  actions: AssistantAction[];
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 ps-1">
      {actions.map((a) =>
        a.kind === 'confirm' ? (
          <ConfirmCard key={a.id} action={a} onNavigate={onNavigate} />
        ) : (
          <NavigateButton key={a.id} action={a} onNavigate={onNavigate} />
        ),
      )}
    </div>
  );
}

/// A navigate button. The href is allowlist-built on the backend, but the click
/// still guards for a single-slash internal path so a malformed value can never
/// trigger an external navigation.
function NavigateButton({
  action,
  onNavigate,
}: {
  action: AssistantNavigateAction;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const go = () => {
    const href = action.href;
    if (!href.startsWith('/') || href.startsWith('//')) return;
    onNavigate();
    router.push(href);
  };
  return (
    <button
      type="button"
      onClick={go}
      className="group w-full text-start px-3.5 py-2.5 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] shadow-[0_6px_18px_-10px_rgba(0,0,0,0.5)] hover:brightness-105 transition"
      style={{ borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 12, borderBottomRightRadius: 3 }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="mono text-[11px] uppercase tracking-[0.1em] font-bold">{action.label}</span>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 opacity-70 group-hover:translate-x-0.5 transition-transform">
          <path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {action.description && (
        <span className="block mt-0.5 text-[11px] leading-snug font-medium opacity-80">{action.description}</span>
      )}
    </button>
  );
}

/// Confirm outcomes persisted for the page session, keyed by action.id (ids are
/// server-nonced, so two separately proposed actions never collide). The chat
/// panel unmounts its cards when it closes (and the "view" button closes it on
/// the way out), which would otherwise reset a completed card back to its
/// confirmable state on the next open — re-showing the button (a double-submit:
/// a second post is a DUPLICATE deal) and dropping the receipt. Recording the
/// outcome here, outside the component tree, makes 'done' and 'dismissed' survive
/// remounts and navigation, so a card that already ran can never run again. The
/// 'running' sentinel closes the remaining race: two mounted cards for the same
/// id can't both fire, because confirm() re-checks the store before executing.
/// Cleared on account change so one user's outcomes never leak to the next.
const confirmOutcomes = new Map<string, ConfirmResult | 'dismissed' | 'running'>();

interface ConfirmResult {
  successText: string;
  viewHref: string;
  viewLabel: string;
  /// On-chain Arc tx hash for the settled move, shown as a verifiable receipt
  /// linking to the Arc explorer. Present for the intents that settle in one
  /// Arc tx (release, withdraw, deposit).
  txHash?: string;
  /// Gateway transfer reference when the spend has no single Arc tx hash to
  /// link (unified-balance spends return a transferId, not a tx hash).
  refId?: string;
}

/// Run a confirm action against the SAME session-gated route the UI uses. Each
/// intent maps to one existing api method; nothing here signs — for release the
/// backend's buyer-agent Circle wallet signs, gated by the session. Returns what
/// to show on success.
async function runConfirmIntent(action: AssistantConfirmAction): Promise<ConfirmResult> {
  if (action.intent === 'post_offer') {
    await api.postListing(action.payload as Parameters<typeof api.postListing>[0]);
    return { successText: 'Your offer is live.', viewHref: '/market', viewLabel: 'View on the market' };
  }
  if (action.intent === 'post_request') {
    const p = action.payload as { posterAddress: string; brief: string; budgetUsdc: number; deadlineDays: number };
    const r = await api.postJob({
      posterAddress: p.posterAddress,
      brief: p.brief,
      budgetUsdc: p.budgetUsdc,
      // deadlineDays is often fractional (server-computed from a calendar
      // date); the route's deadlineDays field is integer-only, so always send
      // the seconds shape, clamped to the route's own bounds (60s..90d).
      deadlineSeconds: Math.min(90 * 86_400, Math.max(60, Math.round(p.deadlineDays * 86_400))),
    });
    return {
      successText: 'Request posted. Your agent is finding developers now.',
      viewHref: `/jobs/${r.jobId}`,
      viewLabel: 'Track matching',
      txHash: r.txHash,
    };
  }
  if (action.intent === 'release_milestone') {
    const p = action.payload as { jobId: string; caller: string };
    const r = await api.releaseDirectDeal(p.jobId, p.caller);
    return { successText: 'Payment released.', viewHref: `/deals/${p.jobId}`, viewLabel: 'Open the deal', txHash: r.txHash };
  }
  if (action.intent === 'withdraw_proceeds') {
    const r = await api.withdrawFromAgent(action.payload as Parameters<typeof api.withdrawFromAgent>[0]);
    return { successText: 'Withdrawal sent.', viewHref: '/profile#agents', viewLabel: 'View your wallets', txHash: r.txHash };
  }
  if (action.intent === 'cash_out') {
    const p = action.payload as {
      address: string;
      destChainKey: string;
      amountUsdc: number;
      recipient: string;
      sourceKind: 'identity';
    };
    // Deterministic bridge id per CARD (action ids are server-nonced, so this is
    // unique per proposed cash-out but STABLE across retries). If the first POST
    // reaches the backend and only the response is lost, "Try again" re-submits
    // under the same id and the backend's per-bridgeId idempotency absorbs it —
    // a fresh id per attempt could double-burn.
    const bridgeId = `chat-${action.id.replace(/[^a-zA-Z0-9._-]/g, '-')}`.slice(0, 120);
    await api.bridgeOut({
      bridgeId,
      address: p.address,
      destChainKey: p.destChainKey as Parameters<typeof api.bridgeOut>[0]['destChainKey'],
      amountUsdc: p.amountUsdc,
      recipient: p.recipient,
      sourceKind: p.sourceKind,
    });
    return {
      successText: 'Cash out started. It lands on the destination chain in a few minutes.',
      viewHref: '/bridge',
      viewLabel: 'Track it',
    };
  }
  if (action.intent === 'gateway_deposit') {
    const p = action.payload as { amountUsdc: number };
    const r = await api.gatewayDeposit(p.amountUsdc);
    return { successText: 'Added to your balance.', viewHref: '/profile', viewLabel: 'View your wallets', txHash: r.depositTxHash };
  }
  if (action.intent === 'gateway_fund_agent') {
    const p = action.payload as { agent: 'buyer' | 'seller'; amountUsdc: number };
    const r = await api.gatewayFundAgent(p.agent, p.amountUsdc);
    return { successText: `Your ${p.agent} agent is funded.`, viewHref: '/profile', viewLabel: 'View your wallets', refId: r.transferId };
  }
  if (action.intent === 'gateway_cash_out') {
    const p = action.payload as { destChainKey: string; recipient: string; amountUsdc: number };
    const r = await api.gatewayCashOut(
      p.destChainKey as Parameters<typeof api.gatewayCashOut>[0],
      p.recipient,
      p.amountUsdc,
    );
    return {
      successText: 'Cash out started. It lands on the destination chain shortly.',
      viewHref: '/bridge',
      viewLabel: 'Track it',
      refId: r.transferId,
    };
  }
  throw new Error('Unknown action');
}

/// A propose->confirm card for a reversible write. Nothing happens until the user
/// taps Confirm; then it calls the intent's existing route. The card is
/// single-shot: once posted it collapses to a success line so it can't re-submit.
function ConfirmCard({
  action,
  onNavigate,
}: {
  action: AssistantConfirmAction;
  onNavigate: () => void;
}) {
  const router = useRouter();
  // Seed from the durable store so a card that already ran (or was dismissed)
  // stays in that state across panel close/open and navigation — never reverting
  // to a re-submittable button. A stale 'running' (in-flight when the panel
  // unmounted) seeds as idle; the confirm() store re-check still blocks a
  // second execution while the original request is genuinely in flight.
  const persisted = confirmOutcomes.get(action.id);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error' | 'dismissed'>(
    persisted === 'dismissed' ? 'dismissed' : persisted && persisted !== 'running' ? 'done' : 'idle',
  );
  const [errMsg, setErrMsg] = useState('');
  const [result, setResult] = useState<ConfirmResult | null>(
    persisted && persisted !== 'dismissed' && persisted !== 'running' ? persisted : null,
  );
  const busyLabel =
    action.intent === 'release_milestone'
      ? 'Releasing…'
      : action.intent === 'withdraw_proceeds'
        ? 'Withdrawing…'
        : action.intent === 'cash_out'
          ? 'Cashing out…'
          : action.intent === 'gateway_deposit'
            ? 'Adding…'
            : action.intent === 'gateway_fund_agent'
              ? 'Funding…'
              : action.intent === 'gateway_cash_out'
                ? 'Cashing out…'
                : 'Posting…';

  async function confirm() {
    if (status === 'running' || status === 'done') return;
    // Re-check the durable store: another mounted card with this id may have
    // already run (or be running). Adopt its outcome instead of executing the
    // intent a second time — this is the double-submit guard for money moves.
    const existing = confirmOutcomes.get(action.id);
    if (existing === 'running') return;
    if (existing && existing !== 'dismissed') {
      setResult(existing);
      setStatus('done');
      return;
    }
    confirmOutcomes.set(action.id, 'running');
    setStatus('running');
    setErrMsg('');
    try {
      const r = await runConfirmIntent(action);
      confirmOutcomes.set(action.id, r);
      setResult(r);
      setStatus('done');
    } catch (e) {
      // Clear the sentinel so a genuine failure stays retryable.
      confirmOutcomes.delete(action.id);
      setErrMsg(e instanceof ApiError ? e.message : 'Could not complete that. Try again.');
      setStatus('error');
    }
  }

  if (status === 'dismissed') return null;

  if (status === 'done' && result) {
    return (
      <div className="border border-[var(--lp-border-light)] bg-[var(--lp-bg)] p-3" style={{ borderRadius: 12 }}>
        <p className="mono text-[10px] uppercase tracking-[0.12em] font-bold text-[var(--lp-accent)]">Done</p>
        <p className="text-[12.5px] text-[var(--lp-dark)] mt-1">{result.successText}</p>
        {result.txHash ? (
          <a
            href={ARC_EXPLORER_TX(result.txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-baseline justify-between gap-3 group"
            title={result.txHash}
          >
            <span className="shrink-0 mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">Receipt</span>
            <span className="min-w-0 mono text-[11px] text-[var(--lp-dark)] tabular-nums truncate underline decoration-[var(--lp-accent)] decoration-2 underline-offset-2 group-hover:opacity-80">
              {result.txHash.slice(0, 8)}…{result.txHash.slice(-6)} ↗
            </span>
          </a>
        ) : result.refId ? (
          <div className="mt-2 flex items-baseline justify-between gap-3" title={result.refId}>
            <span className="shrink-0 mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">Transfer ref</span>
            <span className="min-w-0 mono text-[11px] text-[var(--lp-dark)] tabular-nums truncate">
              {result.refId.slice(0, 8)}…{result.refId.slice(-6)}
            </span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            onNavigate();
            router.push(result.viewHref);
          }}
          className="mt-2 mono text-[10px] uppercase tracking-[0.1em] font-bold text-[var(--lp-dark)] underline decoration-[var(--lp-accent)] decoration-2 underline-offset-2 hover:opacity-80"
        >
          {result.viewLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="border border-[var(--lp-border-light)] bg-[var(--lp-bg)] p-3" style={{ borderRadius: 12 }}>
      <p className="font-sans text-[13px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">{action.title}</p>
      {action.summary && (
        <p className="text-[12px] leading-snug text-[var(--lp-text-sub)] mt-1">{action.summary}</p>
      )}
      <dl className="mt-2 space-y-1.5">
        {action.fields.map((f, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">{f.label}</dt>
            <dd className="min-w-0 text-[12px] text-[var(--lp-dark)] text-end break-all tabular-nums">{f.value}</dd>
          </div>
        ))}
      </dl>
      {action.warning && (
        <p className="flex items-start gap-1.5 mono text-[10px] leading-snug text-[var(--lp-critical)] mt-2.5">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden className="shrink-0 mt-px">
            <path d="M8 1.5l6.5 11.5H1.5L8 1.5zm0 4.2v3.4m0 1.7v.1" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
          <span>{action.warning}</span>
        </p>
      )}
      {status === 'error' && <p className="mono text-[10px] text-[var(--lp-critical)] mt-2">{errMsg}</p>}
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={confirm}
          disabled={status === 'running'}
          className="flex-1 mono text-[10px] uppercase tracking-[0.1em] font-bold px-3 py-2 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] disabled:opacity-60 hover:brightness-105 transition"
          style={{ borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 10, borderBottomRightRadius: 3 }}
        >
          {status === 'running' ? busyLabel : status === 'error' ? 'Try again' : action.confirmLabel ?? 'Confirm'}
        </button>
        <button
          type="button"
          onClick={() => {
            confirmOutcomes.set(action.id, 'dismissed');
            setStatus('dismissed');
          }}
          disabled={status === 'running'}
          className="mono text-[10px] uppercase tracking-[0.1em] font-bold px-3 py-2 border border-[var(--lp-border-light)] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] disabled:opacity-60 transition"
          style={{ borderRadius: 10 }}
        >
          {action.cancelLabel ?? 'Not now'}
        </button>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[85%] min-w-0 break-words px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-[var(--lp-dark)] text-[var(--lp-bg)]'
            : 'max-w-[88%] min-w-0 break-words px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-[var(--lp-bg)] text-[var(--lp-dark)] border border-[var(--lp-border-light)]'
        }
        style={{
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: isUser ? 12 : 3,
          borderBottomRightRadius: isUser ? 3 : 12,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--lp-text-muted)] animate-pulse motion-reduce:animate-none"
    />
  );
}

// One match is either a markdown link [label](href) or **bold** text.
const INLINE_RE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

/// Turns one line of reply text into nodes, resolving markdown links and bold.
/// Internal paths (starting with "/") become in-app links that close the panel;
/// external links open in a new tab. No raw HTML is injected.
function renderInline(line: string, onNavigate: () => void): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(line)) !== null) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    if (m[1] !== undefined && m[2] !== undefined) {
      const label = m[1];
      const href = m[2];
      // Assistant replies are LLM output: only in-app paths and https render
      // as links. A prompt-injected javascript:/data: URI, or a
      // protocol-relative //host, falls through to plain text.
      const isInternal = href.startsWith('/') && !href.startsWith('//');
      const isHttps = href.startsWith('https://');
      if (isInternal) {
        parts.push(
          <Link
            key={`k${key}`}
            href={href}
            onClick={onNavigate}
            className="font-semibold text-[var(--lp-dark)] underline decoration-[var(--lp-accent)] decoration-2 underline-offset-2 hover:opacity-80"
          >
            {label}
          </Link>,
        );
      } else if (isHttps) {
        parts.push(
          <a
            key={`k${key}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold underline decoration-[var(--lp-accent)] decoration-2 underline-offset-2 hover:opacity-80"
          >
            {label}
          </a>,
        );
      } else {
        parts.push(label);
      }
    } else if (m[3] !== undefined) {
      parts.push(
        <strong key={`k${key}`} className="font-bold text-[var(--lp-dark)]">
          {m[3]}
        </strong>,
      );
    }
    last = m.index + m[0].length;
    key += 1;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

/// Renders the assistant reply: line breaks preserved, dash bullets shown with a
/// lime marker, markdown links and bold resolved.
function RichText({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((raw, li) => {
        if (raw.trim() === '') return null;
        const isBullet = /^\s*[-*]\s+/.test(raw);
        const line = isBullet ? raw.replace(/^\s*[-*]\s+/, '') : raw;
        const inline = renderInline(line, onNavigate);
        if (isBullet) {
          return (
            <div key={li} className="flex gap-2">
              <span aria-hidden className="text-[var(--lp-accent)] leading-relaxed">
                •
              </span>
              <p className="flex-1">{inline}</p>
            </div>
          );
        }
        return <p key={li}>{inline}</p>;
      })}
    </div>
  );
}
