'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, type AdminRoomMessage } from '@/core/api';
import { AdminPageHeader } from '@/features/admin/AdminPageHeader';

/// The team room (view 78): one shared room for the support team, and a
/// thread for each case (?case=KT-1042). Asking a named teammate from a case
/// lands in its thread and in the team's Telegram chat.

const POLL_MS = 5000;

export default function TeamRoomPage() {
  return (
    <Suspense>
      <TeamRoom />
    </Suspense>
  );
}

function TeamRoom() {
  const caseRef = useSearchParams().get('case') ?? undefined;
  const [messages, setMessages] = useState<AdminRoomMessage[] | null>(null);
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminRoom(caseRef)
      .then((r) => setMessages((prev) => (JSON.stringify(prev) === JSON.stringify(r.messages) ? prev : r.messages)))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Could not load the room.'));
  }, [caseRef]);

  useEffect(() => {
    void api.adminCaseTeam().then((r) => setTeam(r.team)).catch(() => {});
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const nameOf = (id?: string) => (id ? team.find((m) => m.id === id)?.name ?? 'Teammate' : 'Karwan');

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.adminRoomPost(body, caseRef);
      setText('');
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="CUSTOMER SUPPORT"
        title={caseRef ? `Team thread · ${caseRef}` : 'Team room'}
        description={caseRef ? 'What the team says about this case. The customer never sees it.' : 'Ask for help, hand over, or say what you are on. The customer never sees this room.'}
      />
      {caseRef && (
        <Link href="/admin/support/room" className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-white/15 px-3 text-[13px] text-white/80">
          The shared room
        </Link>
      )}
      {err && <p role="alert" className="mt-4 border-l-2 border-[#e0794f] px-3 py-2 text-[12px] text-[#efaa8d]">{err}</p>}
      <ol className="mt-5 space-y-2" aria-label="Messages">
        {messages === null && [0, 1].map((i) => <li key={i} aria-hidden className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />)}
        {messages?.length === 0 && <li className="text-[13px] text-white/45">Nothing here yet.</li>}
        {messages?.map((m) => (
          <li key={m.id} className="rounded-xl border border-white/10 p-3">
            <p className="text-[11px] text-white/50">
              {nameOf(m.memberId)}
              {m.asks ? ` asks ${nameOf(m.asks)}` : ''} · {new Date(m.at).toLocaleString()}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-white/90">{m.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-end gap-2">
        <label htmlFor="room-write" className="sr-only">Write to the team</label>
        <textarea
          id="room-write"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Write to the team"
          className="min-h-11 flex-1 resize-y rounded-lg border border-white/15 bg-[#0e0e0e] px-3 py-2 text-[13px] text-white outline-none focus:border-white/40"
        />
        <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} className="min-h-11 rounded-lg bg-[var(--lp-accent,#afc95b)] px-4 text-[13px] font-semibold text-[#0e0e0e] disabled:opacity-50">
          Send
        </button>
      </div>
    </div>
  );
}
