'use client';

import type { AdminHomeView } from '@/core/api';
import { DeskCard, StatTile } from '@/features/admin/desk/DeskCard';
import { DeskButton, DeskLink, DeskPage } from '@/features/admin/desk/DeskPage';
import { Cell, DeskTable, type DeskColumn } from '@/features/admin/desk/DeskTable';
import { StatusPill, type PillTone } from '@/features/admin/desk/StatusPill';
import { useDesk } from '@/features/admin/desk/deskContext';
import { firstName, greeting, waitLine, waited } from '@/features/admin/desk/homeWords';
import { useDeskMoney } from '@/features/admin/desk/useDeskCurrency';
import { useDeskHome } from '@/features/admin/desk/useDeskHome';

type Need = AdminHomeView['needsYou'][number];
type Tile = AdminHomeView['today'][number];
type SystemRow = NonNullable<AdminHomeView['system']>[number];

const NEED: Record<Need['kind'], { pill: string; tone: PillTone; action: string; primary?: true }> = {
  approval: { pill: 'Second approval', tone: 'amber', action: 'Review and approve', primary: true },
  dispute: { pill: 'Dispute', tone: 'red', action: 'Open the dispute' },
  late_case: { pill: 'Late case', tone: 'red', action: 'Open the case' },
};

const SYSTEM: Record<SystemRow['state'], { word: string; tone: PillTone }> = {
  working: { word: 'Working', tone: 'green' },
  slow: { word: 'Slow', tone: 'amber' },
  down: { word: 'Down', tone: 'red' },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const roleWord = (role: string | null) => (role ? role[0]!.toUpperCase() + role.slice(1) : 'Teammate');

function Blank({ className }: { className: string }) {
  return <div className={`rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] ${className}`} />;
}

export default function AdminHomePage() {
  const { me } = useDesk();
  const { home, failed, refresh } = useDeskHome();
  const money = useDeskMoney();
  const now = Date.now();
  const name = firstName(me.name);
  const title = name ? `${greeting(now)}, ${name}` : greeting(now);

  if (!home) {
    return (
      <DeskPage title={title} subtitle={failed ? 'Home could not load. It tries again in two minutes.' : undefined} actions={failed ? <DeskButton onClick={() => void refresh()}>Try again</DeskButton> : undefined}>
        {!failed && (
          <>
            <Blank className="h-[198px]" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Blank key={i} className="h-[95px]" />)}</div>
          </>
        )}
      </DeskPage>
    );
  }

  const columns: DeskColumn<Need>[] = [
    { key: 'kind', label: 'Needs you', width: '150px', render: (n) => <StatusPill tone={NEED[n.kind].tone}>{NEED[n.kind].pill}</StatusPill> },
    {
      key: 'what',
      label: '',
      width: 'minmax(0,3fr)',
      render: (n) => <Cell main={n.title} under={n.amountUsdc ? `${n.line} · ${money(n.amountUsdc).main} held` : n.line} />,
    },
    { key: 'since', label: 'Waiting', width: '140px', render: (n) => <span className="text-[13px] font-medium">{waited(now - n.since)}</span> },
    {
      key: 'go',
      label: '',
      width: 'minmax(0,1.3fr)',
      align: 'right',
      render: (n) => <DeskLink href={n.href} tone={NEED[n.kind].primary ? 'primary' : 'secondary'}>{NEED[n.kind].action}</DeskLink>,
    },
  ];

  function tile(t: Tile) {
    switch (t.key) {
      case 'accounts':
        return <StatTile key={t.key} label="New accounts" value={t.count} line={`${t.extra} finished setup`} />;
      case 'deals':
        return <StatTile key={t.key} label="Deals started" value={t.count} line={t.count ? `${money(t.usdc).main} in total` : 'None yet today'} />;
      case 'held':
        return <StatTile key={t.key} label="Money held in deals" value={money(t.usdc).main} line={`across ${plural(t.count, 'deal', 'deals')}`} />;
      case 'support':
        return <StatTile key={t.key} label="Support" value={`${t.count} open`} line={t.minutes === null ? 'No first replies yet today' : `first reply in ${t.minutes} min on average`} />;
    }
  }

  return (
    <DeskPage title={title} subtitle={waitLine(home.needsYou.length)}>
      <DeskTable columns={columns} rows={home.needsYou} rowKey={(n) => `${n.kind}-${n.title}-${n.since}`} empty="Nothing waits for you right now." />

      {home.today.length > 0 && (
        <section aria-label="Today" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{home.today.map(tile)}</section>
      )}

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {home.system && (
          <DeskCard title="System" action={<DeskLink href="/admin/health">Open Health</DeskLink>}>
            <div className="space-y-2.5 px-4 pb-4 pt-1">
              {home.system.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{row.label}</span>
                  <StatusPill tone={SYSTEM[row.state].tone}>{row.detail ? `${SYSTEM[row.state].word} · ${row.detail}` : SYSTEM[row.state].word}</StatusPill>
                </div>
              ))}
            </div>
          </DeskCard>
        )}
        <DeskCard title="Team on the desk now">
          <div className="space-y-2.5 px-4 pb-4 pt-1">
            {home.onShift.length === 0 && <p className="text-[13px] text-[var(--d-text-3)]">Nobody else has used the desk in the last 30 minutes.</p>}
            {home.onShift.map((m) => (
              <div key={m.name} className="flex items-center justify-between gap-3 text-[13px]">
                <span>{m.name}</span>
                <span className="text-[var(--d-text-2)]">
                  {roleWord(m.role)} · {m.openCases ? plural(m.openCases, 'case', 'cases') : `last active ${waited(now - m.lastAt)} ago`}
                </span>
              </div>
            ))}
          </div>
        </DeskCard>
      </div>
    </DeskPage>
  );
}
