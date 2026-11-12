'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type AdminDeskAction } from '@/core/api';
import { ACTIVITY_VIEWS, activityCsv, activityRow, activityShown, type ActivityKind, type ActivityRow } from '@/features/admin/activityRows';
import { SavedViews } from '@/features/admin/desk/Chips';
import { DeskButton, DeskPage } from '@/features/admin/desk/DeskPage';
import { DeskTable, type DeskColumn } from '@/features/admin/desk/DeskTable';
import { useDesk } from '@/features/admin/desk/deskContext';
import { deskTime } from '@/features/admin/desk/homeWords';

/// Activity log (view 79, frame 279:3608): every change from the desk, and
/// every refusal, as a sentence, newest first. Rows are only ever added.

export default function AdminLogPage() {
  const { me } = useDesk();
  const [raw, setRaw] = useState<AdminDeskAction[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [more, setMore] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<'all' | ActivityKind>('all');

  const load = useCallback((before?: number) => {
    api
      .adminDeskActions(before)
      .then((r) => {
        setRaw((cur) => (before ? [...cur, ...r.actions] : r.actions));
        setMore(r.actions.length === 50);
        setFailed(null);
      })
      .catch((e) => setFailed(e instanceof ApiError ? e.message : 'The activity log could not load.'));
  }, []);
  useEffect(() => load(), [load]);
  useEffect(() => {
    // Only the owner reads the team list; teammates see emails instead of names.
    if (!me.owner) return;
    api.adminListTeamMembers().then((r) => setNames(new Map(r.members.map((m) => [m.id, m.name]))), () => undefined);
  }, [me.owner]);

  const rows = useMemo(() => raw.map((r) => activityRow(r, (id) => (id ? names.get(id) ?? null : null))), [raw, names]);
  const shown = activityShown(rows, view);
  const now = Date.now();
  const byId = new Map(raw.map((r) => [r.id, r]));

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([activityCsv(shown)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `karwan-desk-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: DeskColumn<ActivityRow>[] = [
    { key: 'when', label: 'When', width: '120px', render: (r) => <span className="text-[13px] tabular-nums text-[var(--d-text-2)]">{deskTime(r.at, now)}</span> },
    { key: 'who', label: 'Who', width: '160px', render: (r) => <span className="block truncate text-[13px]">{r.who}</span> },
    {
      key: 'what',
      label: 'What',
      width: 'minmax(0,1fr)',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] text-[var(--d-text)]">{r.what}</p>
          {r.second && <p className={`text-[12px] ${r.second === 'Refused' || r.second.startsWith('It did not') ? 'text-[var(--d-red)]' : 'text-[var(--d-text-3)]'}`}>{r.second}</p>}
          {open === r.id && (
            <pre className="mt-2 max-h-[260px] overflow-auto rounded-md bg-[var(--d-bg)] p-3 text-[11px] text-[var(--d-text-2)]">
              {JSON.stringify({ address: `${byId.get(r.id)?.method} ${byId.get(r.id)?.path}`, status: byId.get(r.id)?.status, sent: byId.get(r.id)?.request, answer: byId.get(r.id)?.result }, null, 2)}
            </pre>
          )}
        </div>
      ),
    },
  ];

  return (
    <DeskPage
      title="Activity log"
      subtitle="Every change made from the desk, and every refusal, newest first. Nothing here can be edited or removed."
      actions={<DeskButton onClick={exportCsv} disabled={shown.length === 0}>Export</DeskButton>}
    >
      {failed && <p role="alert" className="text-[13px] text-[var(--d-red)]">{failed}</p>}
      <SavedViews views={ACTIVITY_VIEWS.map((v) => ({ ...v, count: activityShown(rows, v.key).length }))} active={view} onChange={(k) => setView(k as 'all' | ActivityKind)} />
      <DeskTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        onOpen={(r) => setOpen(open === r.id ? null : r.id)}
        selected={open}
        empty="Nothing here yet."
        footer={more && raw.length > 0 ? (
          <button type="button" onClick={() => load(raw[raw.length - 1]!.at)} className="text-[var(--d-blue)] hover:underline">Show older</button>
        ) : undefined}
      />
    </DeskPage>
  );
}
