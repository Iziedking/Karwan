'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api, ApiError, type AdminDealRow } from '@/core/api';
import { pageAccess } from '@/features/admin/adminNavigation';
import { SavedViews } from '@/features/admin/desk/Chips';
import { DetailRow } from '@/features/admin/desk/DeskCard';
import { DeskButton, DeskLink, DeskPage } from '@/features/admin/desk/DeskPage';
import { Cell, DeskTable, type DeskColumn } from '@/features/admin/desk/DeskTable';
import { CopyableId, PanelSection, SidePanel } from '@/features/admin/desk/SidePanel';
import { StatusPill } from '@/features/admin/desk/StatusPill';
import { deskMe, useDesk } from '@/features/admin/desk/deskContext';
import { deskTime } from '@/features/admin/desk/homeWords';
import { useDeskMoney } from '@/features/admin/desk/useDeskCurrency';
import { DEAL_VIEWS, dealLine, dealsShown, type DealView } from '@/features/admin/deskDeals';
import { useDialog } from '@/shared/components/Dialog';

/// Deals (view 79, frame 276:1557): every deal and where its money is. A
/// release needs a second teammate (view 64); the button needs fix.

const PAGE = 50;
const short = (id: string) => (id.length > 12 ? `${id.slice(0, 6)}…` : id);
const tag = (t: string | null, address: string) => (t ? `@${t}` : `${address.slice(0, 6)}…${address.slice(-4)}`);
const ORIGIN: Record<string, string> = { direct: 'direct deal', agent: 'agreed by agents' };
const dayOf = (at: number) => new Date(at + 3_600_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function DealPanel({ d, onClose, onChanged }: { d: AdminDealRow; onClose: () => void; onChanged: () => void }) {
  const { me } = useDesk();
  const money = useDeskMoney();
  const { prompt, notify } = useDialog();
  const [busy, setBusy] = useState(false);
  const level = pageAccess(deskMe(me), ['deals']);
  const now = Date.now();
  const line = dealLine(d, now);
  const amount = money(d.amountUsdc);
  const open = d.stage !== 'settled' && d.stage !== 'cancelled';

  async function extend() {
    const days = await prompt({ title: 'Give the seller more time', message: 'How many more days to deliver?', defaultValue: '3', confirmLabel: 'Extend' });
    if (days === null) return;
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) return notify('Enter a number of days', 'error');
    setBusy(true);
    try {
      await api.adminExtendDeal(d.jobId, Math.round(n * 86_400));
      notify('Deadline moved');
      onChanged();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not extend', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    const reason = await prompt({
      title: 'Ask to pay the next part to the seller',
      message: 'Nothing moves until a second teammate approves it on Waiting for you. Start the reason with the case, like "KS-1042: ...".',
      placeholder: 'Why it needs releasing',
      confirmLabel: 'Ask for approval',
    });
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await api.adminReleaseDeal(d.jobId, reason.trim());
      notify('Asked. A second teammate approves it on Waiting for you.');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not ask', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SidePanel
      title={d.title}
      badge={<StatusPill tone={line.tone}>{line.status}</StatusPill>}
      idLine={<CopyableId value={d.jobId} />}
      href={`/deals/${d.jobId}`}
      onClose={onClose}
      actions={open && level && level !== 'read' ? (
        <>
          <DeskButton disabled={busy} onClick={() => void extend()}>Extend the deadline</DeskButton>
          {level === 'fix' && <DeskButton disabled={busy} onClick={() => void release()}>Ask to release the next part</DeskButton>}
        </>
      ) : undefined}
    >
      <PanelSection title="Deal">
        <DetailRow label="Buyer">{tag(d.buyerTag, d.buyer)}</DetailRow>
        <DetailRow label="Seller">{tag(d.sellerTag, d.seller)}</DetailRow>
        <DetailRow label="Amount">{amount.main}{amount.under ? ` · ${amount.under}` : ''}</DetailRow>
        <DetailRow label="Paid in">{d.parts} parts</DetailRow>
        <DetailRow label="Step">{line.step}</DetailRow>
        <DetailRow label="Due">{d.dueAt ? deskTime(d.dueAt, now) : '—'}</DetailRow>
        <DetailRow label="Started">{deskTime(d.createdAt, now)}</DetailRow>
      </PanelSection>
    </SidePanel>
  );
}

export default function DealsPage() {
  const money = useDeskMoney();
  const [deals, setDeals] = useState<AdminDealRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<DealView>('progress');
  const [query, setQuery] = useState('');
  const [shownCount, setShownCount] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminDeals()
      .then((d) => {
        setDeals(d.deals);
        setFailed(null);
      })
      .catch((e) => setFailed(e instanceof ApiError ? e.message : 'Deals could not load.'));
  }, []);
  useEffect(load, [load]);
  useEffect(() => setShownCount(PAGE), [view, query]);

  const now = Date.now();
  const all = deals ?? [];
  const rows = dealsShown(all, view, query, now);
  const views = DEAL_VIEWS.map((v) => ({ ...v, count: v.key === 'done' ? undefined : dealsShown(all, v.key, '', now).length }));
  const opened = all.find((d) => d.jobId === openId) ?? null;

  const columns: DeskColumn<AdminDealRow>[] = [
    { key: 'deal', label: 'Deal', width: '1.8fr', render: (d) => <Cell main={<span className="block truncate">{d.title}</span>} under={`${short(d.jobId)} · ${ORIGIN[d.origin] ?? d.origin}`} /> },
    { key: 'who', label: 'Buyer and seller', width: '1.3fr', render: (d) => <span className="block truncate text-[13px] text-[var(--d-text-2)]">{tag(d.buyerTag, d.buyer)} → {tag(d.sellerTag, d.seller)}</span> },
    {
      key: 'amount',
      label: 'Amount',
      width: '1.1fr',
      render: (d) => {
        const a = money(d.amountUsdc);
        return <Cell main={<span className="tabular-nums">{a.main}</span>} under={a.under ?? undefined} />;
      },
    },
    { key: 'step', label: 'Step', width: '1.2fr', render: (d) => <span className="text-[13px] text-[var(--d-text-2)]">{dealLine(d, now).step}</span> },
    { key: 'due', label: 'Due', width: '80px', render: (d) => <span className="text-[13px] text-[var(--d-text-2)]">{d.dueAt ? dayOf(d.dueAt) : '—'}</span> },
    { key: 'status', label: 'Status', width: '150px', render: (d) => { const l = dealLine(d, now); return <StatusPill tone={l.tone}>{l.status}</StatusPill>; } },
  ];

  return (
    <DeskPage
      title="Deals"
      subtitle="Every deal and where its money is. Open one to see each step, the messages and the receipts."
      actions={failed ? <DeskButton onClick={load}>Try again</DeskButton> : <DeskLink href="/admin/disputes">Disputes</DeskLink>}
    >
      {failed && <p role="alert" className="text-[13px] text-[var(--d-red)]">{failed}</p>}
      <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--d-line)] bg-[var(--d-surface)] px-3 focus-within:border-[var(--d-line-2)]">
        <Search size={14} className="shrink-0 text-[var(--d-text-3)]" aria-hidden />
        <span className="sr-only">Search deals</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deal number, @tag or title" className="w-full bg-transparent text-[13px] text-[var(--d-text)] outline-none placeholder:text-[var(--d-text-3)]" />
      </label>
      {!query.trim() && <SavedViews views={views} active={view} onChange={(k) => setView(k as DealView)} />}
      {deals ? (
        <DeskTable
          columns={columns}
          rows={rows.slice(0, shownCount)}
          rowKey={(d) => d.jobId}
          onOpen={(d) => setOpenId(d.jobId)}
          selected={openId}
          empty={query.trim() ? 'No deal matches that.' : 'No deals in this list.'}
          footer={rows.length > shownCount ? (
            <button type="button" onClick={() => setShownCount((n) => n + PAGE)} className="text-[var(--d-blue)] hover:underline">
              Show {Math.min(PAGE, rows.length - shownCount)} more of {rows.length}
            </button>
          ) : `${rows.length} ${rows.length === 1 ? 'deal' : 'deals'}`}
        />
      ) : (
        !failed && <div className="h-[260px] rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)]" />
      )}
      {opened && <DealPanel d={opened} onClose={() => setOpenId(null)} onChanged={load} />}
    </DeskPage>
  );
}
