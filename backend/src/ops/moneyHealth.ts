/// Money health on admin /health and the team alerts behind it (view 67).
/// Pure: the live reads are in moneyHealthLive.ts.

import { formatUnits } from 'viem';
import type { SweepResult } from '../money/reconcileSweep.js';
import type { WatcherStatus } from './heartbeats.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/// Three missed 15-minute runs.
const SWEEP_LATE_MS = 45 * MIN;

export type HealthKey = 'needs_attention' | 'stuck' | 'owed' | 'bridges' | 'watchers' | 'sweep';

export interface HealthLine {
  key: HealthKey;
  ok: boolean;
  count: number;
  oldest?: { reference: string; at: number };
  detail?: string;
}

export interface MoneyHealthInput {
  now: number;
  movements: Array<{ reference: string; kind: string; state: string; updatedAt: number }>;
  /// Null when the owed balances could not be read.
  owed: { count: number; totalMicros: bigint } | null;
  bridges: Array<{ bridgeId: string; status: string; updatedAt: number }>;
  watchers: Array<{ name: string; label: string; status: WatcherStatus }>;
  lastSweep: SweepResult | null;
}

function oldestOf<T>(rows: T[], at: (r: T) => number, ref: (r: T) => string): HealthLine['oldest'] {
  const first = [...rows].sort((a, b) => at(a) - at(b))[0];
  return first ? { reference: ref(first), at: at(first) } : undefined;
}

function counted(key: HealthKey, rows: Array<{ reference: string; at: number }>): HealthLine {
  const oldest = oldestOf(rows, (r) => r.at, (r) => r.reference);
  return { key, ok: rows.length === 0, count: rows.length, ...(oldest ? { oldest } : {}) };
}

export function moneyHealth(input: MoneyHealthInput): { ok: boolean; lines: HealthLine[] } {
  const hourAgo = input.now - HOUR;
  const attention = input.movements
    .filter((m) => m.state === 'needs_attention')
    .map((m) => ({ reference: m.reference, at: m.updatedAt }));
  const stuck = input.movements
    .filter((m) => m.state !== 'needs_attention' && m.updatedAt <= hourAgo)
    .map((m) => ({ reference: m.reference, at: m.updatedAt }));
  const bridges = input.bridges
    .filter((b) => b.status !== 'minted' && b.status !== 'error' && b.updatedAt <= hourAgo)
    .map((b) => ({ reference: b.bridgeId, at: b.updatedAt }));
  const down = input.watchers.filter((w) => w.status === 'stalled' || w.status === 'missing');
  const sweepOk = !!input.lastSweep && input.now - input.lastSweep.at < SWEEP_LATE_MS;

  const lines: HealthLine[] = [
    counted('needs_attention', attention),
    counted('stuck', stuck),
    input.owed
      ? {
          key: 'owed',
          ok: input.owed.count === 0,
          count: input.owed.count,
          detail: `${formatUnits(input.owed.totalMicros, 6)} USDC`,
        }
      : { key: 'owed', ok: false, count: 0, detail: 'could not be read' },
    counted('bridges', bridges),
    {
      key: 'watchers',
      ok: down.length === 0,
      count: down.length,
      ...(down.length ? { detail: down.map((w) => w.label).join(', ') } : {}),
    },
    {
      key: 'sweep',
      ok: sweepOk,
      count: sweepOk ? 0 : 1,
      ...(input.lastSweep ? { detail: `last run ${new Date(input.lastSweep.at).toISOString()}` } : { detail: 'not run yet' }),
    },
  ];
  return { ok: lines.every((l) => l.ok), lines };
}

export type AlertState = Partial<Record<HealthKey, { openedAt: number; remindedAt: number }>>;

export interface HealthAlert {
  key: HealthKey;
  kind: 'opened' | 'reminder' | 'cleared';
  line: HealthLine;
}

/// One alert when a line opens, one reminder a day while it stays open, one
/// when it clears. The state is stored so a restart does not repeat them.
export function alertsFor(prev: AlertState, lines: HealthLine[], now: number): { alerts: HealthAlert[]; next: AlertState } {
  const alerts: HealthAlert[] = [];
  const next: AlertState = {};
  for (const line of lines) {
    const open = prev[line.key];
    if (line.ok) {
      if (open) alerts.push({ key: line.key, kind: 'cleared', line });
      continue;
    }
    if (!open) {
      alerts.push({ key: line.key, kind: 'opened', line });
      next[line.key] = { openedAt: now, remindedAt: now };
    } else if (now - open.remindedAt >= DAY) {
      alerts.push({ key: line.key, kind: 'reminder', line });
      next[line.key] = { openedAt: open.openedAt, remindedAt: now };
    } else {
      next[line.key] = open;
    }
  }
  return { alerts, next };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function openPhrase(line: HealthLine): string {
  const n = line.count;
  switch (line.key) {
    case 'needs_attention':
      return `${n} ${plural(n, 'money movement needs', 'money movements need')} attention`;
    case 'stuck':
      return `${n} ${plural(n, 'money movement has', 'money movements have')} not finished after an hour`;
    case 'owed':
      return line.detail === 'could not be read'
        ? 'Owed balances could not be read'
        : `${n} owed ${plural(n, 'balance is', 'balances are')} waiting to be collected (${line.detail})`;
    case 'bridges':
      return `${n} ${plural(n, 'transfer', 'transfers')} between networks not finished after an hour`;
    case 'watchers':
      return `Watchers stalled or missing: ${line.detail}`;
    case 'sweep':
      return 'The scheduled money check has not run for 45 minutes';
  }
}

const CLEAR: Record<HealthKey, string> = {
  needs_attention: 'No money movement needs attention',
  stuck: 'Every money movement has finished or is under an hour old',
  owed: 'Nothing is owed',
  bridges: 'Every transfer between networks has finished',
  watchers: 'Every watcher is running',
  sweep: 'The scheduled money check is running again',
};

export function alertText(alert: HealthAlert): string {
  if (alert.kind === 'cleared') return `Money health: cleared. ${CLEAR[alert.key]}.`;
  const head = alert.kind === 'reminder' ? 'Money health, still open after a day:' : 'Money health:';
  const oldest = alert.line.oldest ? ` Oldest: ${alert.line.oldest.reference}.` : '';
  return `${head} ${openPhrase(alert.line)}.${oldest}`;
}

export interface MoneyHealthTickDeps {
  now(): number;
  sweep(): Promise<SweepResult>;
  saveSweep(result: SweepResult): Promise<void>;
  read(lastSweep: SweepResult): Promise<MoneyHealthInput>;
  loadAlerts(): Promise<AlertState>;
  saveAlerts(state: AlertState): Promise<void>;
  send(texts: string[]): Promise<void>;
}

/// One scheduled run: the stuck-money check, then health, then any alert. The
/// alert state is saved only after the alert is sent, so a failed send is
/// tried again on the next run.
export async function moneyHealthTick(d: MoneyHealthTickDeps): Promise<{ sweep: SweepResult; alerts: HealthAlert[] }> {
  const sweep = await d.sweep();
  await d.saveSweep(sweep);
  const health = moneyHealth(await d.read(sweep));
  const { alerts, next } = alertsFor(await d.loadAlerts(), health.lines, d.now());
  if (alerts.length > 0) await d.send(alerts.map(alertText));
  await d.saveAlerts(next);
  return { sweep, alerts };
}
