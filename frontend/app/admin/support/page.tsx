'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AdminTicketRow } from '@/core/api';
import { CopyId } from '@/shared/components/CopyId';
import { useDialog } from '@/shared/components/Dialog';

/// Admin support tickets: the third operator channel (with Telegram + email).
/// Pick up an open ticket and reply here; the reply relays to the user's chat
/// widget through the shared store. Polls so a new ticket / reply shows up.

interface TicketMsg {
  role: 'user' | 'assistant' | 'operator' | 'system';
  text: string;
  ts: number;
}

const POLL_MS = 5000;

export default function AdminSupport() {
  const [tickets, setTickets] = useState<AdminTicketRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<TicketMsg[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { confirm, notify } = useDialog();
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const loadList = useCallback(async () => {
    try {
      const r = await api.adminSupportList();
      setTickets(r.tickets);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const r = await api.adminSupportGet(id);
      if (selectedRef.current === id) setMessages(r.messages);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    void loadList();
    const t = setInterval(() => {
      void loadList();
      if (selectedRef.current) void loadThread(selectedRef.current);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadList, loadThread]);

  function open(id: string) {
    setSelected(id);
    setMessages([]);
    void loadThread(id);
  }

  async function send() {
    const text = reply.trim();
    if (!text || !selected || busy) return;
    setBusy(true);
    try {
      await api.adminSupportReply(selected, text);
      setReply('');
      await loadThread(selected);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Reply failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!selected) return;
    const ok = await confirm({
      title: 'Close ticket',
      message: 'Close this ticket and email the transcript?',
      confirmLabel: 'Close',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.adminSupportClose(selected);
      setSelected(null);
      setMessages([]);
      await loadList();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Close failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-sans text-[26px] font-extrabold tracking-[-0.01em]">Support</h1>
      {err && <p className="mt-2 text-[13px] text-[#e0794f]">{err}</p>}
      <p className="mt-1 text-[13px] text-white/45">
        Open tickets. Reply here, in Telegram, or by email — all three share the conversation.
      </p>

      <div className="mt-5 grid md:grid-cols-[320px_1fr] gap-4">
        {/* ticket list */}
        <div className="border border-white/10 rounded-xl divide-y divide-white/[0.06] max-h-[70vh] overflow-y-auto">
          {tickets?.length === 0 && (
            <p className="p-4 text-[13px] text-white/35">No open tickets.</p>
          )}
          {tickets?.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => open(t.id)}
              className={`w-full text-start p-3 transition ${
                selected === t.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-[11px] text-white/70">{t.id}</span>
                <span className="mono text-[9px] text-white/30">{t.messageCount} msg</span>
              </div>
              <p className="mt-1 text-[12px] text-white/45 line-clamp-2">
                {t.lastRole ? `${t.lastRole}: ` : ''}
                {t.lastText || '(no messages)'}
              </p>
            </button>
          ))}
        </div>

        {/* thread + reply */}
        <div className="border border-white/10 rounded-xl flex flex-col min-h-[50vh] max-h-[70vh]">
          {!selected ? (
            <div className="flex-1 grid place-items-center text-white/30 text-[13px]">
              Select a ticket
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 p-3 border-b border-white/10">
                <CopyId value={selected} className="text-[12px] text-white/70" />
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="mono text-[10px] uppercase tracking-[0.1em] text-white/45 hover:text-white disabled:opacity-40"
                >
                  close + email
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={m.role === 'operator' ? 'flex justify-end' : 'flex justify-start'}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg text-[13px] leading-snug ${
                        m.role === 'operator'
                          ? 'bg-white text-[#0e0e0e]'
                          : m.role === 'user'
                            ? 'bg-white/10 text-white'
                            : 'bg-white/[0.04] text-white/55'
                      }`}
                    >
                      <span className="mono text-[8px] uppercase tracking-[0.14em] opacity-50 block mb-0.5">
                        {m.role}
                      </span>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-white/10 flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder="Reply to the user..."
                  className="flex-1 resize-none max-h-28 bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2 text-[13px] text-white focus:border-white/40 outline-none"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={busy || !reply.trim()}
                  className="mono text-[11px] uppercase tracking-[0.1em] font-bold px-4 py-2.5 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
