'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError, type AdminAccountView, type AdminMoneyMove } from '@/core/api';
import { AccountActions } from '@/features/admin/accounts/AccountParts';
import { ACCOUNT_STATUS, recordLine } from '@/features/admin/accountsPresentation';
import { DeskCard, DetailRow, StatTile } from '@/features/admin/desk/DeskCard';
import { DeskButton, DeskPage } from '@/features/admin/desk/DeskPage';
import { Cell, DeskTable, type DeskColumn } from '@/features/admin/desk/DeskTable';
import { CopyableId } from '@/features/admin/desk/SidePanel';
import { StatusPill, type PillTone } from '@/features/admin/desk/StatusPill';
import { deskTime } from '@/features/admin/desk/homeWords';
import { useDeskMoney } from '@/features/admin/desk/useDeskCurrency';

/// One account (view 79, frame 291:6134): money, recent money moves, deals,
/// cases and the account's details and record.

const MOVE_TONE: Record<string, PillTone> = { stuck: 'red', moving: 'amber', failed: 'grey', done: 'green' };
const CASE_STATE: Record<string, { label: string; tone: PillTone }> = {
  new: { label: 'New', tone: 'amber' },
  waiting_us: { label: 'Waiting on us', tone: 'amber' },
  waiting_person: { label: 'Waiting on them', tone: 'grey' },
  solved: { label: 'Solved', tone: 'green' },
};
const STAGE: Record<string, string> = { open: 'Not started', accepted: 'Work started', delivered: 'Delivered', disputed: 'In dispute', settled: 'Paid out', cancelled: 'Cancelled' };
const dayOf = (at: number) => new Date(at + 3_600_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function AccountPage() {
  const { address } = useParams<{ address: string }>();
  const money = useDeskMoney();
  const [view, setView] = useState<AdminAccountView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(() => {
    api.adminAccount(address).then((v) => { setView(v); setFailed(null); }, (e) => setFailed(e instanceof ApiError ? e.message : 'This account could not load.'));
  }, [address]);
  useEffect(load, [load]);

  const crumbs = [{ label: 'Accounts', href: '/admin/accounts' }, { label: view?.name ?? 'Account' }];
  if (!view) {
    return (
      <DeskPage crumbs={crumbs} title="Account" subtitle={failed ?? undefined} actions={failed ? <DeskButton onClick={load}>Try again</DeskButton> : undefined}>
        {!failed && <div className="h-[200px] rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)]" />}
      </DeskPage>
    );
  }

  const now = Date.now();
  const status = ACCOUNT_STATUS[view.status];
  const tile = (usdc: string | null) => {
    if (usdc === null) return { value: 'Could not read', line: undefined };
    const a = money(usdc);
    return { value: a.main, line: a.under ?? undefined };
  };
  const balance = tile(view.money.balanceUsdc);
  const held = tile(view.money.heldUsdc);
  const agents = tile(view.money.agentsUsdc);
  const stuck = tile(view.money.stuckUsdc);

  const moveColumns: DeskColumn<AdminMoneyMove>[] = [
    { key: 'what', label: 'What', width: '1.4fr', render: (m) => <Cell main={m.what} under={deskTime(m.since, now)} /> },
    { key: 'amount', label: 'Amount', width: '1.1fr', align: 'right', render: (m) => { const a = money(m.amountUsdc, m.local ? { kept: m.local } : undefined); return <Cell main={<span className="tabular-nums">{a.main}</span>} under={a.under ?? undefined} />; } },
    { key: 'route', label: 'Where', width: '1.1fr', render: (m) => <span className="text-[13px] text-[var(--d-text-2)]">{m.route}</span> },
    { key: 'status', label: 'Status', width: '150px', render: (m) => <StatusPill tone={MOVE_TONE[m.status] ?? 'grey'}>{m.statusLabel}</StatusPill> },
    { key: 'ref', label: 'Reference', width: '150px', render: (m) => <CopyableId value={m.reference} shown={m.reference} /> },
  ];
  type Deal = AdminAccountView['deals'][number];
  const dealColumns: DeskColumn<Deal>[] = [
    { key: 'deal', label: 'Deal', width: '1.6fr', render: (d) => <Cell main={<Link href={`/deals/${d.jobId}`} className="block truncate hover:underline">{d.title}</Link>} under={`${d.side === 'buyer' ? 'Buying from' : 'Selling to'} ${d.with}`} /> },
    { key: 'amount', label: 'Amount', width: '1fr', align: 'right', render: (d) => <span className="text-[13px] tabular-nums">{money(d.amountUsdc).main}</span> },
    { key: 'stage', label: 'Step', width: '130px', render: (d) => <span className="text-[13px] text-[var(--d-text-2)]">{STAGE[d.stage] ?? d.stage}</span> },
  ];
  type Case = AdminAccountView['cases'][number];
  const caseColumns: DeskColumn<Case>[] = [
    { key: 'ref', label: 'Case', width: '120px', render: (c) => <Link href={`/admin/support?case=${c.ref}`} className="text-[13px] text-[var(--d-blue)] hover:underline">{c.ref}</Link> },
    { key: 'state', label: 'State', width: '150px', render: (c) => { const s = CASE_STATE[c.state] ?? { label: c.state, tone: 'grey' as const }; return <StatusPill tone={s.tone}>{s.label}</StatusPill>; } },
    { key: 'last', label: 'Last change', width: '1fr', render: (c) => <span className="text-[13px] text-[var(--d-text-2)]">{deskTime(c.lastAt, now)}</span> },
  ];

  return (
    <DeskPage
      crumbs={crumbs}
      title={view.name}
      badge={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
      meta={(
        <>
          <CopyableId value={view.address} />
          {view.handle && <span>@{view.handle}</span>}
          {view.country && <span>{view.country}</span>}
          <span>joined {dayOf(view.joinedAt)}</span>
          <span>{view.signIn === 'email' ? 'email' : 'wallet'}</span>
          {view.telegramLinked && <span>Telegram linked</span>}
        </>
      )}
      actions={<AccountActions view={view} onChanged={load} />}
    >
      {view.paused && (
        <p className="rounded-lg border border-[#5A4520] bg-[#352A12] px-4 py-2.5 text-[13px] text-[var(--d-amber)]">
          Money out is paused, by {view.paused.by}, {deskTime(view.paused.at, now)}. The person can lift it with World ID; from the desk it takes two teammates.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Balance" value={balance.value} line={balance.line} />
            <StatTile label="Held in deals" value={held.value} line={held.line} />
            <StatTile label="With their agents" value={agents.value} line={agents.line} />
            <StatTile label="Stuck" value={stuck.value} line={stuck.line} tone={Number(view.money.stuckUsdc) > 0 ? 'red' : undefined} />
          </div>
          <section className="space-y-2.5">
            <h2 className="text-[15px] font-semibold">Recent money moves</h2>
            <DeskTable columns={moveColumns} rows={view.moves.slice(0, 20)} rowKey={(m) => m.reference} empty="No money moves yet." />
          </section>
          <section className="space-y-2.5">
            <h2 className="text-[15px] font-semibold">Deals</h2>
            <DeskTable columns={dealColumns} rows={view.deals} rowKey={(d) => d.jobId} empty="No deals yet." />
          </section>
          <section className="space-y-2.5">
            <h2 className="text-[15px] font-semibold">Cases</h2>
            <DeskTable columns={caseColumns} rows={view.cases} rowKey={(c) => c.ref} empty="No cases." />
          </section>
        </div>
        <div className="space-y-3">
          <DeskCard title="Details">
            <div className="space-y-2.5 px-4 pb-4">
              <DetailRow label="Account"><CopyableId value={view.address} /></DetailRow>
              <DetailRow label="Handle">{view.handle ? `@${view.handle}` : '—'}</DetailRow>
              <DetailRow label="Country">{view.country ?? '—'}</DetailRow>
              <DetailRow label="Shown in">{view.money.currency ?? 'USDC'}</DetailRow>
              <DetailRow label="Signed in with">{view.signIn === 'email' ? 'Email' : 'Wallet'}</DetailRow>
              <DetailRow label="Telegram">{view.telegramLinked ? 'Linked' : 'Not linked'}</DetailRow>
              <DetailRow label="Checked">{view.record.checked.length ? view.record.checked.join(', ') : 'Nothing yet'}</DetailRow>
              {view.accountType === 'business' && <DetailRow label="Business">{view.business === 'verified' ? 'Checked' : view.business === 'submitted' ? 'Waiting for a check' : view.business === 'rejected' ? 'Not checked' : 'Not sent'}</DetailRow>}
            </div>
          </DeskCard>
          <DeskCard title="Record">
            <div className="space-y-2.5 px-4 pb-4">
              <DetailRow label="Deals done">{recordLine(view.record)}</DetailRow>
              <DetailRow label="Disputes" tone={view.record.disputes ? 'red' : undefined}>{view.record.disputes}</DetailRow>
            </div>
          </DeskCard>
        </div>
      </div>
    </DeskPage>
  );
}
