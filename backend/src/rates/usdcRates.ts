import { logger } from '../logger.js';

/// How amounts can read on screen. Money always stays in USDC; these only
/// change the figure a person reads (view 51). USDC first, then the owner's
/// order: naira, the dollar, euro, pound, yuan, then one for each language we
/// speak (Hindi, Arabic, Swahili, French-speaking West Africa).
export const DISPLAY_CURRENCIES = ['USDC', 'NGN', 'USD', 'EUR', 'GBP', 'CNY', 'INR', 'AED', 'KES', 'XOF'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export type LocalCurrency = Exclude<DisplayCurrency, 'USDC'>;
const LOCAL: readonly LocalCurrency[] = DISPLAY_CURRENCIES.filter((c): c is LocalCurrency => c !== 'USDC');

export interface UsdcRates {
  /// 1 USDC in each currency. Empty when no fresh rate exists.
  rates: Partial<Record<LocalCurrency, number>>;
  updatedAt: number | null;
  source: 'coingecko' | 'open-er-api' | null;
}

const COINGECKO_URL = `https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=${LOCAL.map((c) => c.toLowerCase()).join(',')}&include_last_updated_at=true`;
const OPEN_ER_URL = 'https://open.er-api.com/v6/latest/USD';
const READ_EVERY_MS = 60_000;
const STALE_AFTER_MS = 15 * 60_000;
/// open.er-api publishes once a day; a publish older than this means the
/// service itself has stopped, not that the day has not turned yet.
const DAILY_SOURCE_MAX_AGE_MS = 36 * 3600_000;
const TIMEOUT_MS = 5_000;

interface Reading {
  rates: Record<LocalCurrency, number>;
  /// When the rate was true: the source's own time for a live feed, the read
  /// time for the daily fallback.
  freshAt: number;
  updatedAt: number;
  source: 'coingecko' | 'open-er-api';
}

let cache: { readAt: number; reading: Reading | null } | null = null;
let inflight: Promise<void> | null = null;
let generation = 0;

/// A read still running when the cache is reset lands nowhere.
export function resetUsdcRatesCache(): void {
  cache = null;
  inflight = null;
  generation += 1;
}

/// One read of the sources at a time, however many callers ask.
function refresh(fetcher: typeof fetch, now: number): Promise<void> {
  if (inflight) return inflight;
  const started = generation;
  const run: Promise<void> = read(fetcher, now)
    .then((fresh) => {
      if (started === generation) cache = { readAt: now, reading: fresh ?? cache?.reading ?? null };
    })
    .finally(() => {
      if (inflight === run) inflight = null;
    });
  inflight = run;
  return run;
}

const EMPTY: UsdcRates = { rates: {}, updatedAt: null, source: null };

function validRates(pick: (currency: LocalCurrency) => unknown): Record<LocalCurrency, number> | null {
  const out = {} as Record<LocalCurrency, number>;
  for (const currency of LOCAL) {
    const value = pick(currency);
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    out[currency] = value;
  }
  return out;
}

async function getJson(fetcher: typeof fetch, url: string): Promise<unknown> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`rates ${response.status}`);
  return response.json();
}

async function fromCoinGecko(fetcher: typeof fetch): Promise<Reading | null> {
  const body = (await getJson(fetcher, COINGECKO_URL)) as { 'usd-coin'?: Record<string, unknown> };
  const row = body?.['usd-coin'];
  if (!row) return null;
  const rates = validRates((currency) => row[currency.toLowerCase()]);
  const updatedSec = row.last_updated_at;
  if (!rates || typeof updatedSec !== 'number') return null;
  const updatedAt = updatedSec * 1000;
  return { rates, freshAt: updatedAt, updatedAt, source: 'coingecko' };
}

async function fromOpenEr(fetcher: typeof fetch, now: number): Promise<Reading | null> {
  const body = (await getJson(fetcher, OPEN_ER_URL)) as { result?: string; time_last_update_unix?: number; rates?: Record<string, unknown> };
  if (body?.result !== 'success' || !body.rates) return null;
  const rates = validRates((currency) => body.rates?.[currency]);
  const publishedAt = typeof body.time_last_update_unix === 'number' ? body.time_last_update_unix * 1000 : null;
  if (!rates || publishedAt === null || now - publishedAt > DAILY_SOURCE_MAX_AGE_MS) return null;
  return { rates, freshAt: now, updatedAt: publishedAt, source: 'open-er-api' };
}

async function read(fetcher: typeof fetch, now: number): Promise<Reading | null> {
  for (const source of [() => fromCoinGecko(fetcher), () => fromOpenEr(fetcher, now)]) {
    try {
      const reading = await source();
      if (reading && now - reading.freshAt <= STALE_AFTER_MS) return reading;
    } catch (error) {
      logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'usdc rates source failed');
    }
  }
  return null;
}

/// The balance in the person's chosen currency, for the assistant. Null when
/// they read USDC or no fresh rate exists, so a stale figure is never quoted.
export function localFigure(
  usdc: number,
  currency: DisplayCurrency | undefined,
  rates: UsdcRates,
): { currency: LocalCurrency; amount: string; rate: number; updatedAt: number } | null {
  if (!currency || currency === 'USDC') return null;
  const rate = rates.rates[currency];
  if (!rate || rates.updatedAt === null) return null;
  const digits = currency === 'NGN' || currency === 'KES' || currency === 'XOF' ? 0 : 2;
  return { currency, amount: (usdc * rate).toFixed(digits), rate, updatedAt: rates.updatedAt };
}

/// 1 USDC in each display currency, read at most once a minute. A rate older
/// than 15 minutes is never returned: the screen reads USDC instead of an old
/// figure. While the reading held is still within that, a caller gets it at
/// once and the next read runs behind it, so no page waits on the rate source.
export async function readUsdcRates(now: number = Date.now(), fetcher: typeof fetch = fetch): Promise<UsdcRates> {
  if (!cache || now - cache.readAt >= READ_EVERY_MS) {
    const usable = !!cache?.reading && now - cache.reading.freshAt <= STALE_AFTER_MS;
    if (usable) void refresh(fetcher, now);
    else await refresh(fetcher, now);
  }
  if (!cache) return EMPTY;
  const reading = cache.reading;
  if (!reading || now - reading.freshAt > STALE_AFTER_MS) return EMPTY;
  return { rates: { ...reading.rates }, updatedAt: reading.updatedAt, source: reading.source };
}
