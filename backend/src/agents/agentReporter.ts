import { listAgentRecords, updateAgentRecord } from '../db/agentRecords.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { weeklyLineDue } from './agentRecord.js';
import { RECORD_READ_PRICE_USDC } from '../x402/recordReadGate.js';

/// The reporter (view 48, step 6). Once a day it sends each person whose
/// weekly line is on, and whose agents paid for data in the last week, one
/// line on what they spent and what for. Fits, shortlists and market watches
/// already reach people as their own events.

const TICK_MS = Number(process.env.AGENT_REPORT_TICK_MS ?? 24 * 60 * 60 * 1000);

/// What is left in the person's data balance, or null when unknown.
type DataBalance = (owner: string) => Promise<number | null>;
const liveDataBalance: DataBalance = async (owner) => (await import('../x402/buyerClient.js')).dataBalanceUsd(owner);

export async function sendWeeklyLines(now = Date.now(), dataBalance: DataBalance = liveDataBalance): Promise<number> {
  let sent = 0;
  for (const r of await listAgentRecords()) {
    const line = weeklyLineDue(r, now);
    if (!line) continue;
    await updateAgentRecord(r.owner, (cur) => ({ ...cur, lastWeeklyAt: now }));
    const left = await dataBalance(r.owner).catch(() => null);
    bus.emitEvent({
      type: 'agent.weekly',
      actor: 'platform',
      // `user` reaches Telegram; `sellerUser` is how the app addresses a personal notice.
      // The price of one check and what is left of the data balance, so the line says it plainly (owner, 5 Nov 2026).
      payload: {
        user: r.owner,
        sellerUser: r.owner,
        ...line,
        budgetUsdc: r.weeklyBudgetUsdc,
        checkPriceUsdc: RECORD_READ_PRICE_USDC,
        ...(left !== null ? { dataBalanceUsdc: Number(left.toFixed(6)) } : {}),
      },
    });
    sent += 1;
  }
  return sent;
}

export function startAgentReporter(): () => void {
  const timer = setInterval(() => {
    sendWeeklyLines().catch((err: Error) => logger.error({ err: err.message }, 'agent weekly lines failed'));
  }, TICK_MS);
  logger.info({ tickMs: TICK_MS }, 'agent reporter started');
  return () => clearInterval(timer);
}
