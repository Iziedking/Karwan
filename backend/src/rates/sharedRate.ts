import { logger } from '../logger.js';
import { pgEnabled, postgresExecutor } from '../db/client.js';
import { readUsdcRates, type LocalCurrency, type UsdcRates } from './usdcRates.js';

/// The one rate every screen, email and message reads amounts at (view 77).
/// The live market reading changes every minute, which made the same balance
/// read differently from one screen to the next. This rate is set at the start
/// of each day in Lagos, and inside the day a currency moves only when the
/// market is more than half a percent away from it. Nobody trades at it.

export interface HeldRate {
  rate: number;
  setAt: number;
}

export interface HeldRates {
  rates: Partial<Record<LocalCurrency, HeldRate>>;
  /// The Lagos day the rates belong to, counted in days.
  day: number;
  /// The last time the market was read and compared.
  checkedAt: number;
  source: 'coingecko' | 'open-er-api';
}

export interface SharedRateStore {
  load(): Promise<HeldRates | null>;
  /// Writes `next` over `prev` and returns what the store now holds, which is
  /// another server's rates when that server wrote first.
  save(next: HeldRates, prev: HeldRates | null): Promise<HeldRates>;
}

const STEP = 0.005;
const LAGOS_OFFSET_MS = 3600_000;
const DAY_MS = 86_400_000;
/// With the sources down the held rate stays this long after its last check.
const KEEP_WITHOUT_CHECK_MS = 6 * 3600_000;
const CHECK_EVERY_MS = 15_000;
const SAVE_CHECK_EVERY_MS = 5 * 60_000;
const EMPTY: UsdcRates = { rates: {}, updatedAt: null, source: null };

const lagosDay = (now: number) => Math.floor((now + LAGOS_OFFSET_MS) / DAY_MS);

/// The rates to hold after one look at the market. Returns `held` itself when
/// the market could not be read.
export function stepSharedRates(held: HeldRates | null, live: UsdcRates, now: number): HeldRates | null {
  const source = live.source;
  const currencies = Object.keys(live.rates) as LocalCurrency[];
  if (!source || live.updatedAt === null || currencies.length === 0) return held;
  const day = lagosDay(now);
  const today = held && held.day === day ? held : null;
  const rates: Partial<Record<LocalCurrency, HeldRate>> = {};
  for (const currency of currencies) {
    const market = live.rates[currency] as number;
    const kept = today?.rates[currency];
    const moved = !kept || Math.abs(market - kept.rate) / kept.rate > STEP;
    rates[currency] = moved ? { rate: market, setAt: now } : kept;
  }
  return { rates, day, checkedAt: now, source: today?.source ?? source };
}

function view(held: HeldRates | null, now: number): UsdcRates {
  if (!held || now - held.checkedAt > KEEP_WITHOUT_CHECK_MS) return EMPTY;
  const rates: Partial<Record<LocalCurrency, number>> = {};
  let updatedAt = 0;
  for (const [currency, kept] of Object.entries(held.rates) as Array<[LocalCurrency, HeldRate]>) {
    rates[currency] = kept.rate;
    updatedAt = Math.max(updatedAt, kept.setAt);
  }
  return updatedAt ? { rates, updatedAt, source: held.source } : EMPTY;
}

const sameRates = (a: HeldRates, b: HeldRates | null) =>
  !!b && a.day === b.day && (Object.keys(a.rates) as LocalCurrency[]).every((c) => a.rates[c]?.setAt === b.rates[c]?.setAt);

export function memoryStore(): SharedRateStore {
  let kept: HeldRates | null = null;
  return {
    load: async () => kept,
    save: async (next) => (kept = next),
  };
}

const KEY = 'shared_rate';

/// One row in the settings table. A write only lands on the row it read, so
/// two servers looking at the market in the same second end on one rate.
function postgresStore(): SharedRateStore {
  const load = async () => {
    const rows = await postgresExecutor().query<{ data: HeldRates }>('SELECT data FROM platform_settings_v1 WHERE key = $1', [KEY]);
    return rows.rows[0]?.data ?? null;
  };
  return {
    load,
    save: async (next, prev) => {
      const written = prev
        ? await postgresExecutor().query(
            `UPDATE platform_settings_v1 SET data = $2, updated_at = $3
             WHERE key = $1 AND (data->>'checkedAt')::bigint = $4 RETURNING key`,
            [KEY, JSON.stringify(next), next.checkedAt, prev.checkedAt],
          )
        : await postgresExecutor().query(
            `INSERT INTO platform_settings_v1 (key, data, updated_at) VALUES ($1, $2, $3)
             ON CONFLICT (key) DO NOTHING RETURNING key`,
            [KEY, JSON.stringify(next), next.checkedAt],
          );
      if (written.rows.length > 0) return next;
      return (await load()) ?? next;
    },
  };
}

/// A reader over one store. It looks at the market at most every 15 seconds;
/// between looks every caller gets the rates held.
export function sharedRatesReader(deps: { store: SharedRateStore; live: (now: number) => Promise<UsdcRates> }) {
  let mine: HeldRates | null = null;
  let lookedAt = 0;
  let savedCheckAt = 0;
  let looking: Promise<void> | null = null;

  async function look(now: number): Promise<void> {
    let held = mine;
    try {
      held = (await deps.store.load()) ?? mine;
    } catch (error) {
      logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'shared rate could not be loaded; this server keeps what it holds');
    }
    const market = await deps.live(now).catch(() => EMPTY);
    const next = stepSharedRates(held, market, now);
    mine = next;
    lookedAt = now;
    if (!next || next === held) return;
    if (sameRates(next, held) && now - savedCheckAt < SAVE_CHECK_EVERY_MS) return;
    try {
      mine = await deps.store.save(next, held);
      savedCheckAt = now;
    } catch (error) {
      logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'shared rate could not be saved');
    }
  }

  return async function read(now: number = Date.now()): Promise<UsdcRates> {
    if (!mine || now - lookedAt >= CHECK_EVERY_MS) {
      looking ??= look(now).finally(() => { looking = null; });
      await looking;
    }
    return view(mine, now);
  };
}

let shared: ReturnType<typeof sharedRatesReader> | null = null;

/// 1 USDC in each display currency, the same figure for everyone. Empty when
/// no rate is held, and the screen reads USDC.
export function readSharedRates(now: number = Date.now()): Promise<UsdcRates> {
  shared ??= sharedRatesReader({ store: pgEnabled ? postgresStore() : memoryStore(), live: (at) => readUsdcRates(at) });
  return shared(now);
}
