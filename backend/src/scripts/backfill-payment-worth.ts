/// Give older payments and settled deals what they were worth when they
/// happened (view 77).
///
/// Since 12 Nov 2026 a payment keeps what it was worth to each side at the
/// moment it completes, and a deal does the same when it settles. Everything
/// from before reads at the rate of the day, marked "about". This fills those
/// in from the price that was published for the day each one happened:
/// CoinGecko's daily history for USDC in each currency. That is a real rate
/// from that day, not Karwan's shared rate (which did not exist yet) and not a
/// guess. Where no price was published for a currency that day, that side is
/// left as it is and keeps reading "about".
///
/// It changes only the kept worth. No amount, state, leg or time of any
/// movement or deal is touched, and running it twice changes nothing: a record
/// that already has its worth is left alone.
///
/// Run once after deploying the change, inside the api container:
///   DRY_RUN=1 node dist/scripts/backfill-payment-worth.js   (preview)
///   node dist/scripts/backfill-payment-worth.js             (apply)

import { parseUnits } from 'viem';
import { pgEnabled, postgresExecutor } from '../db/client.js';
import { listAllDeals, patchDeal } from '../db/deals.js';
import { updateMoneyMovement } from '../db/moneyMovements.js';
import { getProfile } from '../db/profiles.js';
import { logger } from '../logger.js';
import type { MoneyMovement } from '../money/model.js';
import { worthToPeople } from '../money/worth.js';
import type { LocalAmount } from '../rates/quote.js';
import { DISPLAY_CURRENCIES, type DisplayCurrency, type LocalCurrency, type UsdcRates } from '../rates/usdcRates.js';

const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const LOCAL = DISPLAY_CURRENCIES.filter((c): c is LocalCurrency => c !== 'USDC');
type DayRates = Partial<Record<LocalCurrency, number>>;

/// A time as the day CoinGecko's history is asked for: DD-MM-YYYY, UTC.
export function dayOf(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getUTCDate())}-${two(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/// The rates in one day's history answer; null when it carries none.
export function ratesFromHistory(body: unknown): DayRates | null {
  const prices = (body as { market_data?: { current_price?: Record<string, unknown> } } | null)?.market_data?.current_price;
  if (!prices) return null;
  const out: DayRates = {};
  for (const currency of LOCAL) {
    const value = prices[currency.toLowerCase()];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) out[currency] = value;
  }
  return Object.keys(out).length ? out : null;
}

interface DealRow {
  jobId: string;
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  settledAt?: number;
  settledWorth?: Record<string, LocalAmount>;
}

export interface WorthPlan {
  movements: Array<{ reference: string; worth: Record<string, LocalAmount> }>;
  deals: Array<{ jobId: string; worth: Record<string, LocalAmount> }>;
  daysWithoutRates: number;
}

/// What each older payment and settled deal would get. Nothing is written here.
export async function planWorthBackfill(input: {
  movements: readonly MoneyMovement[];
  deals: readonly DealRow[];
  currencyOf: (address: string) => Promise<DisplayCurrency | undefined>;
  ratesFor: (day: string) => Promise<DayRates | null>;
}): Promise<WorthPlan> {
  const days = new Map<string, DayRates | null>();
  const ratesAt = async (ms: number): Promise<UsdcRates | null> => {
    const day = dayOf(ms);
    if (!days.has(day)) days.set(day, await input.ratesFor(day).catch(() => null));
    const rates = days.get(day);
    return rates ? { rates, updatedAt: ms, source: 'coingecko' } : null;
  };
  const plan: WorthPlan = { movements: [], deals: [], daysWithoutRates: 0 };
  for (const movement of input.movements) {
    if (movement.state !== 'completed' || movement.worth || !movement.completedAt) continue;
    const at = movement.completedAt;
    const rates = await ratesAt(at);
    if (!rates) continue;
    const people = [movement.initiatedBy, ...movement.participants.map((party) => party.address)];
    const worth = await worthToPeople(movement.amountMicros, people, { currencyOf: input.currencyOf, rates: async () => rates, now: () => at });
    if (Object.keys(worth).length) plan.movements.push({ reference: movement.reference, worth });
  }
  for (const deal of input.deals) {
    if (!deal.settledAt || deal.settledWorth) continue;
    const at = deal.settledAt;
    const rates = await ratesAt(at);
    if (!rates) continue;
    let micros: bigint;
    try {
      micros = parseUnits(deal.dealAmountUsdc, 6);
    } catch {
      continue;
    }
    const worth = await worthToPeople(micros, [deal.buyer, deal.seller].filter(Boolean), { currencyOf: input.currencyOf, rates: async () => rates, now: () => at });
    if (Object.keys(worth).length) plan.deals.push({ jobId: deal.jobId, worth });
  }
  plan.daysWithoutRates = [...days.values()].filter((rates) => rates === null).length;
  return plan;
}

const WAIT_MS = 3_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/// One day of published USDC prices. The public endpoint allows a few calls a
/// minute, so each new day waits before it asks, and a refusal is tried once more.
async function historyFor(day: string): Promise<DayRates | null> {
  const url = `https://api.coingecko.com/api/v3/coins/usd-coin/history?date=${day}&localization=false`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await sleep(attempt === 0 ? WAIT_MS : 60_000);
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } });
    if (response.status === 429) continue;
    if (!response.ok) return null;
    return ratesFromHistory(await response.json());
  }
  return null;
}

async function completedMovements(): Promise<MoneyMovement[]> {
  if (!pgEnabled) throw new Error('this backfill reads the Postgres store; DATABASE_URL is not set');
  const rows = await postgresExecutor().query<{ data: MoneyMovement }>("SELECT data FROM money_movements WHERE state = 'completed'");
  return rows.rows.map((row) => row.data);
}

async function main() {
  const currencies = new Map<string, DisplayCurrency | undefined>();
  const currencyOf = async (address: string) => {
    const key = address.toLowerCase();
    if (!currencies.has(key)) currencies.set(key, (await getProfile(key).catch(() => null))?.settings?.displayCurrency);
    return currencies.get(key);
  };
  const plan = await planWorthBackfill({ movements: await completedMovements(), deals: await listAllDeals(), currencyOf, ratesFor: historyFor });
  logger.info({ movements: plan.movements.length, deals: plan.deals.length, daysWithoutRates: plan.daysWithoutRates, dryRun }, 'payment worth backfill: planned');
  for (const change of plan.movements) {
    logger.info({ reference: change.reference, worth: change.worth }, 'payment worth backfill: movement');
    if (dryRun) continue;
    await updateMoneyMovement(change.reference, (current) => (current.worth ? current : { ...current, worth: change.worth, version: current.version + 1 }));
  }
  for (const change of plan.deals) {
    logger.info({ jobId: change.jobId, worth: change.worth }, 'payment worth backfill: deal');
    if (dryRun) continue;
    await patchDeal(change.jobId, { settledWorth: change.worth }, { keepUpdatedAt: true });
  }
  logger.info({ applied: dryRun ? 0 : plan.movements.length + plan.deals.length, dryRun }, 'payment worth backfill: done');
}

if (process.argv[1]?.endsWith('backfill-payment-worth.js') || process.argv[1]?.endsWith('backfill-payment-worth.ts')) {
  main().then(
    () => process.exit(0),
    (err) => {
      logger.error({ err: (err as Error).message }, 'payment worth backfill failed');
      process.exit(1);
    },
  );
}
