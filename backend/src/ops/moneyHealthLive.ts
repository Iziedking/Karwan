/// The live side of money health (view 67): the scheduled stuck-money check
/// every 15 minutes under one lease, the reads behind admin health, and the
/// team alerts.

import { parseUnits } from 'viem';
import { listAllBridges } from '../db/bridges.js';
import { getRecord, putRecord } from '../db/evidence.js';
import { logger } from '../logger.js';
import { liveSweepIo, openMovements } from '../money/reconcileLive.js';
import { runReconcileSweep, type SweepResult } from '../money/reconcileSweep.js';
import { sendMoneyHealthEmail } from '../emails/moneyHealth.js';
import { sendTelegramMessage, supportOperatorChatId, telegramEnabled } from '../telegram/bot.js';
import { watcherHealth } from './heartbeats.js';
import { leased } from './leasedLoop.js';
import { moneyHealth, moneyHealthTick, type AlertState, type MoneyHealthInput } from './moneyHealth.js';

const EVERY_MS = 15 * 60_000;
const OLDER_THAN_MS = 60 * 60_000;

/// Open owed balances from view 66, or null when they could not be read.
async function owedNow(): Promise<MoneyHealthInput['owed']> {
  try {
    const { owedForSupport } = await import('../money/owedLive.js');
    const { open, totals } = await owedForSupport();
    if (totals.some((t) => t.totalUsdc === null)) return null;
    const totalMicros = totals.reduce((sum, t) => sum + parseUnits(t.totalUsdc ?? '0', 6), 0n);
    return { count: open.length, totalMicros };
  } catch {
    return null;
  }
}

async function healthInput(lastSweep: SweepResult | null): Promise<MoneyHealthInput> {
  const [movements, bridges, owed] = await Promise.all([openMovements(), listAllBridges(), owedNow()]);
  return {
    now: Date.now(),
    movements: movements.map((m) => ({ reference: m.reference, kind: m.kind, state: m.state, updatedAt: m.updatedAt })),
    owed,
    bridges: bridges.map((b) => ({ bridgeId: b.bridgeId, status: b.status, updatedAt: b.updatedAt })),
    watchers: watcherHealth().map((w) => ({ name: w.name, label: w.label, status: w.status })),
    lastSweep,
  };
}

/// The Money section of admin /health.
export async function readMoneyHealth() {
  const lastSweep = await getRecord<SweepResult>('money-sweep', 'last');
  const input = await healthInput(lastSweep);
  return { ...moneyHealth(input), lastSweep };
}

async function sendAlerts(texts: string[]): Promise<void> {
  const chat = supportOperatorChatId();
  const viaTelegram = telegramEnabled() && chat !== null;
  if (viaTelegram) await sendTelegramMessage(chat, texts.join('\n\n'), undefined, { plain: true });
  const email = await sendMoneyHealthEmail(texts);
  if (!viaTelegram && !email.delivered) {
    // No team chat and the email did not go: keep the alert to try again.
    throw new Error('money health alert not delivered');
  }
}

export function startMoneyReconcile(): () => void {
  const run = leased('moneyReconcile', EVERY_MS, async () => {
    try {
      const out = await moneyHealthTick({
        now: Date.now,
        sweep: () => runReconcileSweep(liveSweepIo, { now: Date.now(), olderThanMs: OLDER_THAN_MS }),
        saveSweep: (result) => putRecord('money-sweep', 'last', result),
        read: (sweep) => healthInput(sweep),
        loadAlerts: async () => (await getRecord<AlertState>('money-alerts', 'state')) ?? {},
        saveAlerts: (state) => putRecord('money-alerts', 'state', state),
        send: sendAlerts,
      });
      if (out.sweep.fixed.length > 0 || out.alerts.length > 0) {
        logger.info({ fixed: out.sweep.fixed, left: out.sweep.left.length, alerts: out.alerts.length }, 'money check ran');
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'money check failed, tried again in 15 minutes');
    }
  });
  void run();
  const timer = setInterval(() => void run(), EVERY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
