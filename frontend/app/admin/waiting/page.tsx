'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminMoneyRequest } from '@/core/api';
import { DeskButton, DeskPage } from '@/features/admin/desk/DeskPage';
import { SavedViews } from '@/features/admin/desk/Chips';
import { StatusPill } from '@/features/admin/desk/StatusPill';
import { useDesk } from '@/features/admin/desk/deskContext';
import { useDeskHome } from '@/features/admin/desk/useDeskHome';
import { useDeskMoney } from '@/features/admin/desk/useDeskCurrency';
import { waitingCard, waitingTab, waitingTabs, type WaitingTab } from '@/features/admin/waitingPresentation';
import { useDialog } from '@/shared/components/Dialog';

/// Waiting for you (view 79, frames 275:1011 and 283:5226): money and chain
/// moves a second teammate decides. The backend holds the rule (view 64).

function Ask({ caseRef, onDone }: { caseRef: string | null; onDone: () => void }) {
  const { notify } = useDialog();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await api.adminRoomPost(body, caseRef ?? undefined);
      notify(caseRef ? `Asked in the ${caseRef} thread` : 'Asked in the team room');
      onDone();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not send', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <label className="block text-[12px] text-[var(--d-text-2)]" htmlFor={`ask-${caseRef ?? 'room'}`}>
        {caseRef ? `Your question goes to the ${caseRef} thread.` : 'Your question goes to the team room.'}
      </label>
      <textarea
        id={`ask-${caseRef ?? 'room'}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={2000}
        className="w-full rounded-md border border-[var(--d-line)] bg-[var(--d-bg)] px-3 py-2 text-[13px] text-[var(--d-text)] outline-none focus:border-[var(--d-line-2)]"
      />
      <div className="flex gap-2">
        <DeskButton tone="primary" disabled={sending || !text.trim()} onClick={() => void send()}>{sending ? 'Sending' : 'Send question'}</DeskButton>
        <DeskButton onClick={onDone}>Cancel</DeskButton>
      </div>
    </div>
  );
}

function Card({ r, onChanged }: { r: AdminMoneyRequest; onChanged: () => void }) {
  const { me, network } = useDesk();
  const money = useDeskMoney();
  const { confirm, notify } = useDialog();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const card = waitingCard(r, me.id, Date.now());
  const amount = card.amountUsdc ? money(card.amountUsdc) : null;
  const pending = r.status === 'pending';

  async function act(kind: 'approve' | 'turn-down' | 'withdraw') {
    if (kind === 'approve') {
      const ok = await confirm({
        title: card.title,
        message: `${card.askedBy.replace(/ · .*/, '')}: ${card.line} It runs once, as you, if nothing changed since.${network === 'mainnet' ? ' This is real money.' : ''}`,
        confirmLabel: 'Approve and run',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (kind === 'approve') {
        const out = await api.adminApproveRequest(r.id);
        notify(out.request.status === 'done' ? 'Approved and done' : 'Approved. It did not go through.', out.request.status === 'done' ? undefined : 'error');
      } else if (kind === 'turn-down') {
        await api.adminTurnDownRequest(r.id);
        notify('Turned down');
      } else {
        await api.adminWithdrawRequest(r.id);
        notify('Withdrawn');
      }
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'That did not work. Try again.', 'error');
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  return (
    <li className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusPill tone="amber">{card.kindLabel}</StatusPill>
        <span className="text-[12px] text-[var(--d-text-3)]">{card.askedBy}</span>
        {card.ref && <span className="ml-auto max-w-full truncate text-[12px] text-[var(--d-text-2)]">{card.ref}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[var(--d-text)]">{card.title}</p>
          <p className="mt-0.5 text-[12px] text-[var(--d-text-2)]">{card.line}</p>
        </div>
        {amount && (
          <div className="text-right">
            <p className="text-[17px] font-semibold tabular-nums text-[var(--d-text)]">{amount.main}</p>
            {amount.under && <p className="text-[12px] tabular-nums text-[var(--d-text-3)]">{amount.under}</p>}
          </div>
        )}
      </div>
      {card.outcome && <p className="mt-2 text-[12px] text-[var(--d-text-2)]">{card.outcome}</p>}
      {pending && (
        <>
          {card.note && <p className="mt-2 text-[12px] text-[var(--d-text-3)]">{card.note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {card.canApprove ? (
              <>
                <DeskButton tone="primary" disabled={busy} onClick={() => void act('approve')}>Approve</DeskButton>
                <DeskButton disabled={busy} onClick={() => void act('turn-down')}>Turn down</DeskButton>
              </>
            ) : (
              <DeskButton disabled={busy} onClick={() => void act('withdraw')}>Withdraw</DeskButton>
            )}
            {!asking && <DeskButton disabled={busy} onClick={() => setAsking(true)}>Ask a question</DeskButton>}
          </div>
          {asking && <Ask caseRef={card.caseRef} onDone={() => setAsking(false)} />}
        </>
      )}
    </li>
  );
}

export default function WaitingPage() {
  const { refresh } = useDeskHome();
  const [requests, setRequests] = useState<AdminMoneyRequest[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tab, setTab] = useState<WaitingTab>('waiting');

  const load = useCallback(() => {
    api
      .adminMoneyRequests()
      .then((r) => {
        setRequests(r.requests);
        setFailed(null);
      })
      .catch((e) => setFailed(e instanceof ApiError ? e.message : 'Waiting for you could not load.'));
  }, []);
  useEffect(load, [load]);

  const changed = () => {
    load();
    void refresh();
  };
  const shown = (requests ?? []).filter((r) => waitingTab(r) === tab);
  const empty = tab === 'waiting' ? 'Nothing waits for a second person.' : tab === 'approved' ? 'Nothing approved yet.' : 'Nothing turned down.';

  return (
    <DeskPage
      title="Waiting for you"
      subtitle="Money and chain moves wait here for a second person. You cannot approve a move you asked for."
      actions={failed ? <DeskButton onClick={load}>Try again</DeskButton> : undefined}
    >
      {failed && <p role="alert" className="text-[13px] text-[var(--d-red)]">{failed}</p>}
      {requests && (
        <>
          <SavedViews views={waitingTabs(requests)} active={tab} onChange={(k) => setTab(k as WaitingTab)} />
          {shown.length === 0 ? (
            <p className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] px-4 py-6 text-[13px] text-[var(--d-text-2)]">{empty}</p>
          ) : (
            <ul className="space-y-3">
              {shown.map((r) => <Card key={r.id} r={r} onChanged={changed} />)}
            </ul>
          )}
        </>
      )}
      {!requests && !failed && <div className="h-[140px] rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)]" />}
    </DeskPage>
  );
}
