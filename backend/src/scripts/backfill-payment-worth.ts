/// Give older payments, settled deals and rows on one account (yield claimed,
/// refunds, money back from an agent) what they were worth when they happened
/// (view 77).
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
/// The price source refuses the production server (12 Nov 2026: rate limit 2,
/// none left, on every call), so the prices are fetched somewhere else and
/// handed in as a file: one chart per currency for the whole stretch, a
/// handful of calls instead of one per day.
///
///   1. Anywhere with the repo and a network (no database is touched):
///        FETCH_ONLY=1 npm run backfill:payment-worth > usdc-history.json
///   2. Into the api container, on stdin (nothing is left on the server):
///        cat usdc-history.json | ssh karwan-vm 'docker exec -i -e RATES_FILE=- -e DRY_RUN=1 karwan-api node dist/scripts/backfill-payment-worth.js'
///      then the same without DRY_RUN=1 to apply.
///
/// Without RATES_FILE it fetches the charts itself, which works wherever the
/// source answers.

import { parseUnits } from 'viem';
import { pgEnabled, postgresExecutor } from '../db/client.js';
import { listAllDeals, patchDeal } from '../db/deals.js';
import { updateMoneyMovement } from '../db/moneyMovements.js';
import { getProfile } from '../db/profiles.js';
import { logger } from '../logger.js';
import type { MoneyMovement } from '../money/model.js';
import { activityWorth, worthToPeople } from '../money/worth.js';
import { keepActivityWorth, listActivityWithoutWorth } from '../db/activityLog.js';
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

/// A row on one account (yield claimed, a refund, money back from an agent).
interface ActivityRow {
  id: string;
  address: string;
  ts: number;
  amountUsdc?: string;
  worth?: LocalAmount;
}

export interface WorthPlan {
  movements: Array<{ reference: string; worth: Record<string, LocalAmount> }>;
  deals: Array<{ jobId: string; worth: Record<string, LocalAmount> }>;
  activity: Array<{ id: string; worth: LocalAmount }>;
  daysWithoutRates: number;
}

/// What each older payment, settled deal and account row would get. Nothing is
/// written here.
export async function planWorthBackfill(input: {
  movements: readonly MoneyMovement[];
  deals: readonly DealRow[];
  activity?: readonly ActivityRow[];
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
  const plan: WorthPlan = { movements: [], deals: [], activity: [], daysWithoutRates: 0 };
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
  for (const row of input.activity ?? []) {
    if (row.worth || !row.amountUsdc) continue;
    const rates = await ratesAt(row.ts);
    if (!rates) continue;
    const worth = await activityWorth(row, { currencyOf: input.currencyOf, rates: async () => rates, now: () => row.ts });
    if (worth) plan.activity.push({ id: row.id, worth });
  }
  plan.daysWithoutRates = [...days.values()].filter((rates) => rates === null).length;
  return plan;
}

/// Published USDC prices over time, by currency: [time in ms, price] pairs, as
/// CoinGecko's market_chart/range returns them.
export type PriceCharts = Partial<Record<LocalCurrency, Array<[number, number]>>>;

/// The rates of one day (DD-MM-YYYY, UTC) from the charts: for each currency
/// the published price nearest to noon that day, and none when the chart has
/// nothing inside that day.
export function ratesFromCharts(charts: PriceCharts): (day: string) => Promise<DayRates | null> {
  return async (day) => {
    const [dd, mm, yyyy] = day.split('-').map(Number);
    const start = Date.UTC(yyyy!, mm! - 1, dd!);
    const noon = start + 12 * 3_600_000;
    const out: DayRates = {};
    for (const currency of LOCAL) {
      let best: [number, number] | null = null;
      for (const point of charts[currency] ?? []) {
        if (point[0] < start || point[0] >= start + 86_400_000 || !(point[1] > 0)) continue;
        if (!best || Math.abs(point[0] - noon) < Math.abs(best[0] - noon)) best = point;
      }
      if (best) out[currency] = best[1];
    }
    return Object.keys(out).length ? out : null;
  };
}

/// The charts in a file's text; anything that is not a chart is dropped.
export function chartsFromText(text: string): PriceCharts {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const out: PriceCharts = {};
  for (const currency of LOCAL) {
    const points = raw[currency];
    if (!Array.isArray(points)) continue;
    const good = points.filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && p[1] > 0);
    if (good.length) out[currency] = good;
  }
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const say = (line: string) => process.stderr.write(`${line}\n`);

/// One currency's chart for the stretch. A refusal waits as long as the source
/// asks, a few times over, and says so, then gives up on that currency.
async function chartFor(currency: LocalCurrency, fromMs: number, toMs: number): Promise<Array<[number, number]> | null> {
  const url = `https://api.coingecko.com/api/v3/coins/usd-coin/market_chart/range?vs_currency=${currency.toLowerCase()}&from=${Math.floor(fromMs / 1000)}&to=${Math.ceil(toMs / 1000)}`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } });
    if (response.status === 429) {
      const wait = Math.min(120, Math.max(15, Number(response.headers.get('retry-after')) || 30));
      say(`${currency}: the price source said wait; trying again in ${wait}s (${attempt} of 5)`);
      await sleep(wait * 1000);
      continue;
    }
    if (!response.ok) return null;
    const prices = ((await response.json()) as { prices?: unknown }).prices;
    return Array.isArray(prices) ? (prices as Array<[number, number]>) : null;
  }
  return null;
}

async function fetchCharts(currencies: readonly LocalCurrency[], fromMs: number, toMs: number): Promise<PriceCharts> {
  const out: PriceCharts = {};
  for (const currency of currencies) {
    const chart = await chartFor(currency, fromMs, toMs).catch(() => null);
    say(`${currency}: ${chart ? `${chart.length} prices` : 'no prices'}`);
    if (chart) out[currency] = chart;
    await sleep(2_500);
  }
  return out;
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}

async function completedMovements(): Promise<MoneyMovement[]> {
  if (!pgEnabled) throw new Error('this backfill reads the Postgres store; DATABASE_URL is not set');
  const rows = await postgresExecutor().query<{ data: MoneyMovement }>("SELECT data FROM money_movements WHERE state = 'completed'");
  return rows.rows.map((row) => row.data);
}

/// The stretch the charts cover when they are fetched on their own: from before
/// Karwan's first settled deal (19 May 2026 on testnet) to now.
const FIRST_DAY = Date.UTC(2026, 4, 1);

async function main() {
  if (process.env.FETCH_ONLY === '1') {
    process.stdout.write(JSON.stringify(await fetchCharts(LOCAL, FIRST_DAY, Date.now())));
    return;
  }
  const file = process.env.RATES_FILE;
  const { readFile } = await import('node:fs/promises');
  const charts = file ? chartsFromText(file === '-' ? await readAll(process.stdin) : await readFile(file, 'utf8')) : await fetchCharts(LOCAL, FIRST_DAY, Date.now());
  logger.info({ currencies: Object.keys(charts), from: file ? (file === '-' ? 'stdin' : file) : 'the price source' }, 'payment worth backfill: prices read');
  if (Object.keys(charts).length === 0) throw new Error('no prices were read, so nothing can be worked out; fetch them with FETCH_ONLY=1 and pass RATES_FILE');
  const currencies = new Map<string, DisplayCurrency | undefined>();
  const currencyOf = async (address: string) => {
    const key = address.toLowerCase();
    if (!currencies.has(key)) currencies.set(key, (await getProfile(key).catch(() => null))?.settings?.displayCurrency);
    return currencies.get(key);
  };
  const plan = await planWorthBackfill({ movements: await completedMovements(), deals: await listAllDeals(), activity: await listActivityWithoutWorth(), currencyOf, ratesFor: ratesFromCharts(charts) });
  logger.info({ movements: plan.movements.length, deals: plan.deals.length, activity: plan.activity.length, daysWithoutRates: plan.daysWithoutRates, dryRun }, 'payment worth backfill: planned');
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
  for (const change of plan.activity) {
    logger.info({ id: change.id, worth: change.worth }, 'payment worth backfill: account row');
    if (dryRun) continue;
    await keepActivityWorth(change.id, change.worth);
  }
  logger.info({ applied: dryRun ? 0 : plan.movements.length + plan.deals.length + plan.activity.length, dryRun }, 'payment worth backfill: done');
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
