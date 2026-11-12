'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  api,
  type AdminCaseMessage,
  type AdminCaseRow,
  type AdminCaseView,
} from '@/core/api';
import { Segmented } from '@/shared/components/Segmented';
import { stripMarkdown } from '@/shared/utils/format';
import { channelLabel, dueLabel, kindLabel, stateLabel } from './supportDesk';

/// The support desk's cases (view 78): the queue, one case with its
/// conversation and the person's records, on a laptop side by side and on a
/// phone one after the other. Polls so new cases and replies show up.

const POLL_MS = 5000;
const TONE = { calm: 'text-white/50', soon: 'text-[#d9ad55]', late: 'text-[#efaa8d]' } as const;

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function CaseDesk() {
  const [cases, setCases] = useState<AdminCaseRow[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'mine' | 'solved'>('open');
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<AdminCaseView | null>(null);
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([]);
  const [me, setMe] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [err, setErr] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const loadQueue = useCallback(async () => {
    try {
      const r = await api.adminCases(filter === 'solved' ? { state: 'solved' } : filter === 'mine' ? { askedMe: true } : {});
      setCases((prev) => (JSON.stringify(prev) === JSON.stringify(r.cases) ? prev : r.cases));
      setErr(null);
    } catch (e) {
      setErr(errorText(e, 'Could not load the cases.'));
    }
  }, [filter]);

  const loadCase = useCallback(async (ref: string) => {
    try {
      const r = await api.adminCase(ref);
      if (selectedRef.current === ref) setView((prev) => (JSON.stringify(prev) === JSON.stringify(r) ? prev : r));
    } catch {
      /* the next poll tries again */
    }
  }, []);

  useEffect(() => {
    void api.adminCaseTeam().then((r) => { setTeam(r.team); setMe(r.me); }).catch(() => {});
    const named = new URLSearchParams(window.location.search).get('case');
    if (named && /^K[ST]-\d{4,}$/.test(named)) {
      setSelected(named);
      void loadCase(named);
    }
  }, [loadCase]);

  useEffect(() => {
    void loadQueue();
    const t = setInterval(() => {
      setNow(Date.now());
      void loadQueue();
      if (selectedRef.current) void loadCase(selectedRef.current);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadQueue, loadCase]);

  function open(ref: string) {
    setSelected(ref);
    setView(null);
    void loadCase(ref);
  }

  const changed = async () => {
    if (selected) await loadCase(selected);
    await loadQueue();
  };

  return (
    <section aria-label="Cases" className="mt-5">
      {err && <p role="alert" className="mb-3 border-l-2 border-[#e0794f] px-3 py-2 text-[12px] text-[#efaa8d]">{err}</p>}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_280px]">
        <div className={selected ? 'hidden lg:block' : ''}>
          <CaseQueue cases={cases} filter={filter} onFilter={setFilter} selected={selected} onOpen={open} now={now} />
        </div>
        {selected ? (
          <>
            <div className="min-w-0">
              <button type="button" onClick={() => setSelected(null)} className="mb-2 min-h-11 rounded-lg border border-white/15 px-3 text-[13px] text-white/80 lg:hidden">
                Back to cases
              </button>
              {view ? <CaseConversation view={view} team={team} me={me} onChanged={changed} /> : <Skeleton />}
            </div>
            <div className="min-w-0">{view ? <CasePeoplePanel view={view} onChanged={changed} /> : null}</div>
          </>
        ) : (
          <div className="hidden min-h-[40vh] place-items-center rounded-xl border border-white/10 text-[13px] text-white/40 lg:col-span-2 lg:grid">
            Pick a case to answer it.
          </div>
        )}
      </div>
    </section>
  );
}

function Skeleton() {
  return <div aria-hidden className="h-[50vh] animate-pulse rounded-xl border border-white/10 bg-white/[0.02]" />;
}

function CaseQueue(props: {
  cases: AdminCaseRow[] | null;
  filter: 'open' | 'mine' | 'solved';
  onFilter: (f: 'open' | 'mine' | 'solved') => void;
  selected: string | null;
  onOpen: (ref: string) => void;
  now: number;
}) {
  const tabs: Array<['open' | 'mine' | 'solved', string]> = [['open', 'Open'], ['mine', 'Asked of me'], ['solved', 'Solved']];
  return (
    <div className="rounded-xl border border-white/10">
      <div role="tablist" aria-label="Which cases" className="flex gap-1 border-b border-white/10 p-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={props.filter === key}
            onClick={() => props.onFilter(key)}
            className={`min-h-9 rounded-full px-3 text-[12px] ${props.filter === key ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="max-h-[70vh] divide-y divide-white/[0.06] overflow-y-auto">
        {props.cases === null && [0, 1, 2].map((i) => <div key={i} aria-hidden className="m-3 h-12 animate-pulse rounded-lg bg-white/[0.04]" />)}
        {props.cases?.length === 0 && <p className="p-4 text-[13px] text-white/40">No cases here.</p>}
        {props.cases?.map((c) => {
          const due = dueLabel(c.dueAt, props.now, c.firstRepliedAt);
          return (
            <button
              key={c.ref}
              type="button"
              onClick={() => props.onOpen(c.ref)}
              aria-current={props.selected === c.ref ? 'true' : undefined}
              className={`w-full p-3 text-start transition ${props.selected === c.ref ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-white">{c.person?.name ?? c.email ?? 'Guest'}</span>
                <span className="mono text-[11px] text-white/50">{c.ref}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-white/60">{kindLabel(c.kind)} · {channelLabel(c.lastChannel)}</p>
              <p className={`mt-0.5 text-[12px] ${TONE[due.tone]}`}>{stateLabel(c.state)} · {due.text}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function who(m: AdminCaseMessage, team: Array<{ id: string; name: string }>): string {
  if (m.role === 'person') return 'Customer';
  if (m.role === 'bot') return 'Help bot';
  if (m.role === 'system') return 'Karwan';
  return team.find((t) => t.id === m.memberId)?.name ?? 'Team';
}

function deliveredLine(m: AdminCaseMessage): string | null {
  if (m.role !== 'teammate' || m.heldReason) return null;
  if (!m.deliveredVia) return null;
  return m.deliveredVia.length ? `Sent on ${m.deliveredVia.map((v) => (v === 'telegram' ? 'Telegram' : 'email')).join(' and ')}` : 'On the case page only';
}

function CaseConversation(props: { view: AdminCaseView; team: Array<{ id: string; name: string }>; me: string | null; onChanged: () => Promise<void> }) {
  const { view } = props;
  const ref = view.case.ref;
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [text, setText] = useState('');
  const [askOf, setAskOf] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await props.onChanged();
      return true;
    } catch (e) {
      setErr(errorText(e, fallback));
      await props.onChanged();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    const ok = await run(() => (mode === 'reply' ? api.adminCaseReply(ref, t) : api.adminCaseNote(ref, t)), 'Not sent.');
    if (ok) setText('');
  }

  return (
    <div className="flex min-h-[60vh] flex-col rounded-xl border border-white/10">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
        <span className="mono text-[12px] text-white/70">{ref}</span>
        <span className="text-[12px] text-white/55">{kindLabel(view.case.kind)}</span>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-white/70">{stateLabel(view.case.state)}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => api.adminCaseState(ref, view.case.state === 'solved' ? 'waiting_us' : 'solved'), 'Could not change the state.')}
            className="min-h-9 rounded-lg border border-white/15 px-3 text-[12px] text-white/85"
          >
            {view.case.state === 'solved' ? 'Reopen' : 'Mark solved'}
          </button>
          <Link href={`/admin/support/room?case=${encodeURIComponent(ref)}`} className="inline-flex min-h-9 items-center rounded-lg border border-white/15 px-3 text-[12px] text-white/85">
            Team thread
          </Link>
          {props.me && view.case.assignee !== props.me && (
            <button type="button" disabled={busy} onClick={() => void run(() => api.adminCaseAssign(ref, props.me!), 'Could not take it.')} className="min-h-9 rounded-lg border border-white/15 px-3 text-[12px] text-white/85">
              Take it
            </button>
          )}
        </div>
      </div>

      <ol className="flex-1 space-y-2 overflow-y-auto p-3" aria-label="Conversation">
        {view.messages.map((m) => {
          const mine = m.role === 'teammate';
          const note = m.role === 'note';
          const sent = deliveredLine(m);
          return (
            <li key={m.id} className={mine || note ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-snug ${
                  note
                    ? 'border border-[#d9ad55]/30 bg-[#d9ad55]/[0.06] text-white/85'
                    : m.heldReason
                      ? 'border border-[#e0794f]/40 text-white/60'
                      : mine
                        ? 'bg-white text-[#0e0e0e]'
                        : m.role === 'person'
                          ? 'bg-white/10 text-white'
                          : 'bg-white/[0.04] text-white/60'
                }`}
              >
                <p className="mb-0.5 text-[11px] opacity-60">
                  {who(m, props.team)} · {new Date(m.at).toLocaleString()}
                  {note ? ' · Only the team sees this' : ''}
                </p>
                <p className="select-text whitespace-pre-wrap break-words">{stripMarkdown(m.text)}</p>
                {m.heldReason && <p className="mt-1 text-[11px] text-[#efaa8d]">Not sent. {m.heldReason}</p>}
                {sent && <p className="mt-1 text-[11px] opacity-60">{sent}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="space-y-2 border-t border-white/10 p-3">
        <div role="tablist" aria-label="Write" className="flex gap-1">
          {(['reply', 'note'] as const).map((k) => (
            <button key={k} role="tab" type="button" aria-selected={mode === k} onClick={() => setMode(k)} className={`min-h-9 rounded-full px-3 text-[12px] ${mode === k ? 'bg-white/10 text-white' : 'text-white/55'}`}>
              {k === 'reply' ? 'Reply to the customer' : 'Note for the team'}
            </button>
          ))}
        </div>
        {err && <p role="alert" className="text-[12px] text-[#efaa8d]">{err}</p>}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`write-${ref}`}>{mode === 'reply' ? 'Reply' : 'Note'}</label>
          <textarea
            id={`write-${ref}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder={mode === 'reply' ? 'Write to the customer' : 'Only the team sees notes'}
            className="max-h-40 min-h-11 flex-1 resize-y rounded-lg border border-white/15 bg-[#0e0e0e] px-3 py-2 text-[13px] text-white outline-none focus:border-white/40"
          />
          <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} className="min-h-11 rounded-lg bg-[var(--lp-accent,#afc95b)] px-4 text-[13px] font-semibold text-[#0e0e0e] disabled:opacity-50">
            {mode === 'reply' ? 'Send' : 'Save note'}
          </button>
        </div>
        {props.team.length > 1 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ask a teammate">
            <span className="text-[12px] text-white/55">Ask a teammate</span>
            {props.team.filter((t) => t.id !== props.me).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={askOf === t.id}
                onClick={() => setAskOf(askOf === t.id ? '' : t.id)}
                className={`min-h-9 rounded-full border px-3 text-[12px] ${askOf === t.id ? 'border-white/60 bg-white/10 text-white' : 'border-white/15 text-white/70'}`}
              >
                {t.name}
              </button>
            ))}
            <button
              type="button"
              disabled={busy || !askOf || !text.trim()}
              onClick={() => void run(() => api.adminCaseAsk(ref, askOf, text.trim()), 'Could not ask.').then((ok) => ok && setText(''))}
              className="min-h-9 rounded-lg border border-white/15 px-3 text-[12px] text-white/85 disabled:opacity-40"
            >
              Ask with this text
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/// A money fix from a case (view 78): it is asked for on its own route, which
/// opens a request that a second teammate approves on Waiting for you. The
/// reason starts with the case reference, so the request leads back here.
function AskForFix(props: { caseRef: string; jobId: string; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function ask() {
    const why = reason.trim();
    if (why.length < 3 || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await api.adminReleaseDeal(props.jobId, `${props.caseRef}: ${why}`);
      await api.adminCaseFix(props.caseRef, res.request.id);
      setOpen(false);
      setReason('');
      setNote('Asked. A second teammate approves it on Waiting for you.');
      await props.onChanged();
    } catch (e) {
      setNote(errorText(e, 'Could not ask for it.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 p-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="min-h-9 rounded-lg border border-white/15 px-3 text-[12px] text-white/85">
          Ask for a fix: pay the next milestone
        </button>
      ) : (
        <div className="space-y-2">
          <label htmlFor={`fix-${props.jobId}`} className="block text-[12px] text-white/60">Why, for the teammate who approves</label>
          <textarea id={`fix-${props.jobId}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-lg border border-white/15 bg-[#0e0e0e] px-2 py-1.5 text-[12px] text-white" />
          <div className="flex gap-2">
            <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void ask()} className="min-h-9 rounded-lg bg-white px-3 text-[12px] font-semibold text-[#0e0e0e] disabled:opacity-40">Ask a second teammate</button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-lg border border-white/15 px-3 text-[12px] text-white/70">Cancel</button>
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-[12px] text-white/60">{note}</p>}
    </div>
  );
}

function CasePeoplePanel(props: { view: AdminCaseView; onChanged: () => Promise<void> }) {
  const { view } = props;
  const ref = view.case.ref;
  const [kind, setKind] = useState<'deal' | 'transfer'>('deal');
  const [id, setId] = useState('');
  const [address, setAddress] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function attach() {
    setErr(null);
    try {
      await api.adminCaseAttach(ref, kind, id.trim());
      setId('');
      await props.onChanged();
    } catch (e) {
      setErr(errorText(e, 'Could not add it.'));
    }
  }

  async function link() {
    setErr(null);
    try {
      await api.adminCaseLink(ref, address.trim());
      setAddress('');
      await props.onChanged();
    } catch (e) {
      setErr(errorText(e, 'Could not tie it to that account.'));
    }
  }

  return (
    <aside className="space-y-3" aria-label="The customer">
      <div className="rounded-xl border border-white/10 p-3">
        {view.person ? (
          <>
            <p className="text-[14px] font-semibold text-white">{view.person.name}</p>
            <p className="text-[12px] text-white/55">
              {view.person.handle ? `@${view.person.handle} · ` : ''}
              {view.person.verified ? 'Verified' : 'Not verified'}
            </p>
            {view.person.earlierCases.length > 0 && (
              <p className="mt-2 text-[12px] text-white/50">
                Earlier: {view.person.earlierCases.slice(0, 4).map((c) => `${c.ref} ${stateLabel(c.state).toLowerCase()}`).join(', ')}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-[14px] font-semibold text-white">{view.case.email ?? 'Guest'}</p>
            <p className="text-[12px] text-white/55">Not signed in. No account records are shown.</p>
            {!view.case.contactVerified && view.case.email && (
              <div className="mt-2 flex gap-2">
                <label className="sr-only" htmlFor={`link-${ref}`}>Account address</label>
                <input id={`link-${ref}`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Account address 0x…" className="min-h-9 min-w-0 flex-1 rounded-lg border border-white/15 bg-[#0e0e0e] px-2 text-[12px] text-white" />
                <button type="button" disabled={!address.trim()} onClick={() => void link()} className="min-h-9 rounded-lg border border-white/15 px-3 text-[12px] text-white/85 disabled:opacity-40">Tie</button>
              </div>
            )}
          </>
        )}
      </div>

      {view.records.map((r) => (
        <div key={`${r.kind}-${r.reference}`} className="rounded-xl border border-white/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-white">{r.kind === 'deal' ? 'Deal' : 'Transfer'} {r.reference}</span>
            <span className="text-[12px] text-white/55">{r.state.replaceAll('_', ' ')}</span>
          </div>
          <p className="mt-1 text-[13px] text-white">
            {r.worth ? `${r.worth.currency} ${Number(r.worth.amount).toLocaleString()} · ` : ''}
            {r.amountUsdc} USDC
          </p>
          {r.otherSide && <p className="text-[12px] text-white/55">With {r.otherSide.name}{r.otherSide.handle ? ` (@${r.otherSide.handle})` : ''}</p>}
          {r.summary && <p className="text-[12px] text-white/55">{r.summary}</p>}
          {r.nextStep && <p className="mt-1 text-[12px] text-white/70">{r.nextStep}</p>}
          {r.failedReason && <p className="mt-1 text-[12px] text-[#efaa8d]">Failed: {r.failedReason.replaceAll('_', ' ')}</p>}
        </div>
      ))}

      {view.case.records.filter((r) => r.kind === 'deal').map((r) => (
        <AskForFix key={r.id} caseRef={ref} jobId={r.id} onChanged={props.onChanged} />
      ))}

      {view.case.fixes.length > 0 && (
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-[12px] text-white/55">Fixes asked for</p>
          {view.case.fixes.map((f) => <p key={f.requestId} className="text-[12px] text-white/80">{f.action} · waiting for a second teammate</p>)}
        </div>
      )}

      {view.case.address && (
        <div className="rounded-xl border border-white/10 p-3">
          <p className="mb-2 text-[12px] text-white/55">Add a deal or transfer of theirs</p>
          <Segmented label="Kind of record" options={[{ value: 'deal', label: 'Deal' }, { value: 'transfer', label: 'Transfer' }]} value={kind} onChange={setKind} className="mb-2" />
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={`rec-${ref}`}>Id or reference</label>
            <input id={`rec-${ref}`} value={id} onChange={(e) => setId(e.target.value)} placeholder="Id or reference" className="min-h-9 min-w-0 flex-1 rounded-lg border border-white/15 bg-[#0e0e0e] px-2 text-[12px] text-white" />
            <button type="button" disabled={id.trim().length < 4} onClick={() => void attach()} className="min-h-9 rounded-lg border border-white/15 px-3 text-[12px] text-white/85 disabled:opacity-40">Add</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="text-[12px] text-[#efaa8d]">{err}</p>}
    </aside>
  );
}
