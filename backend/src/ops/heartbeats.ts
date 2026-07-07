/// Liveness for the in-process background watchers plus a freshness read of the
/// VPS cron state files. The admin diagnostics page reads this to show, per
/// background job: is it meant to be running, when did it last tick, and is that
/// recent enough. A wedged or crashed setInterval, or a watcher that is dormant
/// because its env gate is unset, is invisible in the existing dependency checks
/// (model key, RPC, balances) — this fills that gap so a silent stall shows up
/// with one click instead of a log dive.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';

interface Beat {
  lastRunAt: number;
  runs: number;
}

const beats = new Map<string, Beat>();

/// Called at the top of each watcher's interval callback. Cheap: one Map write,
/// no I/O. Records that the timer fired (liveness), not that the tick succeeded;
/// per-tick errors are already logged by each watcher.
export function recordHeartbeat(name: string): void {
  const prev = beats.get(name);
  beats.set(name, { lastRunAt: Date.now(), runs: (prev?.runs ?? 0) + 1 });
}

/// A background watcher we expect to be running, with how to tell whether it is
/// supposed to be (its env gate) and its normal tick cadence. `enabled` mirrors
/// the exact gate in index.ts / each start function, so a watcher that never
/// starts because a gate is off reads as "dormant" rather than "missing".
interface WatcherDescriptor {
  name: string;
  label: string;
  intervalMs: number;
  enabled: () => boolean;
}

const MINUTE = 60_000;

const WATCHERS: WatcherDescriptor[] = [
  { name: 'dealWatcher', label: 'Deal watcher (milestone release, deadline reclaim)', intervalMs: MINUTE, enabled: () => true },
  { name: 'factoringWatcher', label: 'Factoring watcher (repayment on settle)', intervalMs: MINUTE, enabled: () => !!config.KARWAN_INVOICE_REGISTRY_ADDR },
  { name: 'poWatcher', label: 'PO financing watcher (release + repay on chain)', intervalMs: MINUTE, enabled: () => !!config.KARWAN_PO_FINANCING_ADDR && !!config.cctpRelayWalletId },
  { name: 'jobExpiryWatcher', label: 'Job expiry watcher (stale jobs, deadline calls)', intervalMs: 30_000, enabled: () => true },
  { name: 'reputationReconciler', label: 'Reputation reconciler (replay settled deals)', intervalMs: 10 * MINUTE, enabled: () => config.REPUTATION_RECONCILER_ENABLED },
  { name: 'trendScout', label: 'Trend scout (daily demand nudges)', intervalMs: 24 * 60 * MINUTE, enabled: () => config.TREND_NUDGES_ENABLED },
  { name: 'balanceWatcher', label: 'Balance watcher (wallet credit / debit)', intervalMs: MINUTE, enabled: () => true },
  { name: 'cooldownWatcher', label: 'Vault cooldown watcher', intervalMs: 5 * MINUTE, enabled: () => !!config.KARWAN_VAULT_ADDR },
  { name: 'vaultScanCache', label: 'Vault scan cache refresh', intervalMs: 5 * MINUTE, enabled: () => !!config.KARWAN_VAULT_ADDR },
  { name: 'yieldIndexer', label: 'Yield indexer (staking charts)', intervalMs: 90_000, enabled: () => !!config.KARWAN_YIELD_DISTRIBUTOR_ADDR },
];

export type WatcherStatus = 'healthy' | 'stalled' | 'missing' | 'dormant';

export interface WatcherHealth {
  name: string;
  label: string;
  enabled: boolean;
  status: WatcherStatus;
  lastRunAt: number | null;
  ageMs: number | null;
  runs: number;
}

/// Cross-reference the expected watchers with their recorded heartbeats.
/// 'dormant'  = gate off, not expected to run (grey, fine).
/// 'missing'  = enabled but never ticked (crashed at boot / not started) — red.
/// 'stalled'  = ticked before but has gone quiet past ~3 cycles — red.
/// 'healthy'  = ticked recently.
export function watcherHealth(): WatcherHealth[] {
  const now = Date.now();
  return WATCHERS.map((w) => {
    const beat = beats.get(w.name);
    const enabled = w.enabled();
    const lastRunAt = beat?.lastRunAt ?? null;
    const ageMs = lastRunAt != null ? now - lastRunAt : null;
    const staleMs = Math.max(w.intervalMs * 3, 90_000);
    let status: WatcherStatus;
    if (!enabled) status = 'dormant';
    else if (lastRunAt == null) status = 'missing';
    else if (ageMs! > staleMs) status = 'stalled';
    else status = 'healthy';
    return { name: w.name, label: w.label, enabled, status, lastRunAt, ageMs, runs: beat?.runs ?? 0 };
  });
}

export type CronStatus = 'fresh' | 'stale' | 'unknown';

export interface CronHealth {
  name: string;
  label: string;
  schedule: string;
  lastRunDate: string | null;
  status: CronStatus;
  detail?: string;
}

function readDataJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), 'data', file), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/// A daily cron is fresh if its idempotency state file records a run today or
/// yesterday (UTC). We cannot read the host crontab from inside the app, so we
/// infer liveness from the `last*Date` each cron writes to skip a double-run.
/// 'unknown' means no state file yet (never run on this host, or fresh rebuild).
function dailyStatus(lastDate: string | null): CronStatus {
  if (!lastDate) return 'unknown';
  const now = Date.now();
  const today = isoDay(new Date(now));
  const yesterday = isoDay(new Date(now - 86_400_000));
  return lastDate === today || lastDate === yesterday ? 'fresh' : 'stale';
}

/// The VPS host crons (see docs/cronJobs.md). Freshness inferred from the state
/// files each cron writes under data/. The backup cron has an external
/// Healthchecks.io heartbeat and writes no state file we can read, so it is
/// surfaced as externally monitored rather than given a live status.
export function cronHealth(): CronHealth[] {
  const yd = readDataJson('yieldDistribution.json');
  const td = readDataJson('treasuryDrain.json');
  const ydDate = typeof yd?.lastDistributedDate === 'string' ? yd.lastDistributedDate : null;
  const tdDate = typeof td?.lastDrainedDate === 'string' ? td.lastDrainedDate : null;
  const ydTx = typeof yd?.lastTxHash === 'string' ? yd.lastTxHash : null;
  return [
    {
      name: 'yieldDistribution',
      label: 'Staker yield distribution',
      schedule: '09:00 UTC daily',
      lastRunDate: ydDate,
      status: dailyStatus(ydDate),
      detail: ydTx ? `last tx ${ydTx.slice(0, 10)}…` : undefined,
    },
    {
      name: 'treasuryDrain',
      label: 'Treasury drain + USYC sweep',
      schedule: '08:30 UTC daily',
      lastRunDate: tdDate,
      status: dailyStatus(tdDate),
    },
    {
      name: 'backup',
      label: 'DB + state backup',
      schedule: '03:07 UTC daily',
      lastRunDate: null,
      status: 'unknown',
      detail: 'externally monitored (Healthchecks.io)',
    },
  ];
}
