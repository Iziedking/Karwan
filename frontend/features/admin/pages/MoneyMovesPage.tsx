'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api, ApiError, type AdminMoneyMove, type AdminMoneyMoves } from '@/core/api';
import { SavedViews } from '@/features/admin/desk/Chips';
import { DeskButton, DeskPage } from '@/features/admin/desk/DeskPage';
import { Cell, DeskTable, type DeskColumn } from '@/features/admin/desk/DeskTable';
import { StatusPill, type PillTone } from '@/features/admin/desk/StatusPill';
import { waited } from '@/features/admin/desk/homeWords';
import { useDeskMoney } from '@/features/admin/desk/useDeskCurrency';
import { MOVE_VIEWS, movesShown, type MoveView } from '@/features/admin/moneyMoves';

/// Money moves (view 79, frame 276:2066): every top-up, send, withdrawal and
/// move between networks, stuck ones first.

const TONE: Record<AdminMoneyMove['status'], PillTone> = { stuck: 'red', moving: 'amber', failed: 'grey', done: 'green' };
const EVERY_MS = 60_000;

export default function MoneyMovesPage() {
  const money = useDeskMoney();
  const [data, setData] = useState<AdminMoneyMoves | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<MoveView>('stuck');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    api
      .adminMoneyMoves()
      .then((d) => {
        setData(d);
        setFailed(null);
      })
      .catch((e) => setFailed(e instanceof ApiError ? e.message : 'Money moves could not load.'));
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, EVERY_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const now = Date.now();
  const columns: DeskColumn<AdminMoneyMove>[] = [
    { key: 'what', label: 'What', width: '1.3fr', render: (r) => <Cell main={r.what} under={r.reference} /> },
    { key: 'who', label: 'Who', width: '1fr', render: (r) => <span className="text-[13px] text-[var(--d-text-2)]">{r.who}</span> },
    {
      key: 'amount',
      label: 'Amount',
      width: '1.2fr',
      render: (r) => {
        const a = money(r.amountUsdc, r.local ? { kept: r.local } : undefined);
        return <Cell main={<span className="tabular-nums">{a.main}</span>} under={a.under ? <span className="tabular-nums">{a.under}</span> : undefined} />;
      },
    },
    { key: 'route', label: 'Route', width: '1.2fr', render: (r) => <span className="text-[13px] text-[var(--d-text-2)]">{r.route}</span> },
    { key: 'since', label: 'Since', width: '90px', render: (r) => <span className="text-[13px] text-[var(--d-text-2)]">{r.status === 'failed' ? '—' : waited(now - r.since)}</span> },
    { key: 'status', label: 'Status', width: '170px', render: (r) => <StatusPill tone={TONE[r.status]}>{r.statusLabel}</StatusPill> },
  ];

  const views = MOVE_VIEWS.map((v) => ({ ...v, count: data?.counts[v.key] }));
  const rows = data ? movesShown(data.rows, view, query) : [];

  return (
    <DeskPage
      title="Money moves"
      subtitle="Every top-up, send, withdrawal and move between networks. Stuck moves come first."
      actions={failed ? <DeskButton onClick={load}>Try again</DeskButton> : undefined}
    >
      {failed && <p role="alert" className="text-[13px] text-[var(--d-red)]">{failed}</p>}
      <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--d-line)] bg-[var(--d-surface)] px-3 focus-within:border-[var(--d-line-2)]">
        <Search size={14} className="shrink-0 text-[var(--d-text-3)]" aria-hidden />
        <span className="sr-only">Search money moves</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search @tag, amount, reference or transaction"
          className="w-full bg-transparent text-[13px] text-[var(--d-text)] outline-none placeholder:text-[var(--d-text-3)]"
        />
      </label>
      {!query.trim() && <SavedViews views={views} active={view} onChange={(k) => setView(k as MoveView)} />}
      {data ? (
        <DeskTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.reference}
          empty={query.trim() ? 'No move matches that.' : view === 'stuck' ? 'Nothing is stuck.' : 'Nothing here.'}
          footer={query.trim() ? `${rows.length} found across every list` : undefined}
        />
      ) : (
        !failed && <div className="h-[220px] rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)]" />
      )}
    </DeskPage>
  );
}
