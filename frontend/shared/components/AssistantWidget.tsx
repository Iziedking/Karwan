'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

interface LiveMsg {
  role: 'user' | 'assistant' | 'operator' | 'system';
  text: string;
  ts: number;
}

const POLL_MS = 4000;

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
  const [open, setOpen] = useState(false);
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
  const lastTsRef = useRef(0);
  const pollBusyRef = useRef(false);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, turns, live, loading, liveClosed]);

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

  const pollLive = useCallback(async () => {
    if (!convoId || pollBusyRef.current) return;
    pollBusyRef.current = true;
    try {
      const r = await api.supportPoll(convoId, lastTsRef.current);
      if (r.messages.length > 0) {
        lastTsRef.current = Math.max(lastTsRef.current, ...r.messages.map((m) => m.ts));
        setLive((prev) => [...prev, ...r.messages]);
      }
      if (r.status === 'closed') setLiveClosed(true);
    } catch {
      /* transient network blip; the next tick retries */
    } finally {
      pollBusyRef.current = false;
    }
  }, [convoId]);

  // Drain operator replies while the live thread is open and on screen.
  useEffect(() => {
    if (!open || !convoId || liveClosed) return;
    const id = setInterval(() => void pollLive(), POLL_MS);
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
  }

  function resetToAssistant() {
    setConvoId(null);
    setLive([]);
    setLiveClosed(false);
    setHumanSuggested(false);
    lastTsRef.current = 0;
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
      const { reply } = await api.assistantChat(next);
      // The assistant appends [[HUMAN]] only when it judges the issue needs a
      // person. Strip the marker from what we show and reveal the handoff.
      const needsHuman = /\[\[HUMAN\]\]/i.test(reply);
      const clean = reply.replace(/\[\[HUMAN\]\]/gi, '').trim();
      setTurns([...next, { role: 'assistant', content: clean }]);
      if (needsHuman) setHumanSuggested(true);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t.error;
      setError(msg || t.error);
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

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.launcherAria}
          className="fixed z-[60] end-4 sm:end-5 bottom-16 sm:bottom-20 inline-flex items-center gap-2 px-3 py-2.5 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] mono text-[11px] uppercase tracking-[0.12em] font-bold shadow-[0_8px_24px_-10px_rgba(0,0,0,0.45)] hover:brightness-105 transition"
          style={{
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M8 1.5c-3.6 0-6.5 2.4-6.5 5.4 0 1.7.9 3.2 2.4 4.2-.1.8-.5 1.7-1.2 2.5 1.3-.1 2.5-.5 3.4-1.1.6.1 1.2.2 1.9.2 3.6 0 6.5-2.4 6.5-5.4S11.6 1.5 8 1.5z" />
          </svg>
          <span className="hidden sm:inline">{t.launcherLabel}</span>
        </button>
      )}

      {open && (
        <div
          className="fixed z-[70] inset-x-0 bottom-0 sm:inset-x-auto sm:end-5 sm:bottom-5 sm:w-[380px] flex flex-col bg-[var(--lp-card)] border border-[var(--lp-border-light)] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.45)] h-[72vh] sm:h-[540px] max-h-[calc(100vh-1rem)]"
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
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] hover:bg-black/[0.05] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            <Bubble role="assistant">{t.greeting}</Bubble>
            {turns.map((m, i) => (
              <Bubble key={i} role={m.role}>
                {m.role === 'assistant' ? (
                  <RichText text={m.content} onNavigate={() => setOpen(false)} />
                ) : (
                  m.content
                )}
              </Bubble>
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
                    <Bubble role={m.role === 'user' ? 'user' : 'assistant'}>{m.text}</Bubble>
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
                {!isLive && (
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

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[85%] px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-[var(--lp-dark)] text-[var(--lp-bg)]'
            : 'max-w-[88%] px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-[var(--lp-bg)] text-[var(--lp-dark)] border border-[var(--lp-border-light)]'
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
      parts.push(
        href.startsWith('/') ? (
          <Link
            key={`k${key}`}
            href={href}
            onClick={onNavigate}
            className="font-semibold text-[var(--lp-dark)] underline decoration-[var(--lp-accent)] decoration-2 underline-offset-2 hover:opacity-80"
          >
            {label}
          </Link>
        ) : (
          <a
            key={`k${key}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold underline decoration-[var(--lp-accent)] decoration-2 underline-offset-2 hover:opacity-80"
          >
            {label}
          </a>
        ),
      );
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
