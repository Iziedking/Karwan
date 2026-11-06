import { listAllAgentWallets } from '../db/agentWallets.js';
import { getProfile } from '../db/profiles.js';
import { listOpenListings } from '../db/listings.js';
import { bus, recentEventsByType } from '../events.js';
import { logger } from '../logger.js';
import { recordHeartbeat } from '../ops/heartbeats.js';
import { categoryOf, inferCategory, type CategoryId } from '../listings/categories.js';
import type { CategoryDemand } from '../intelligence/marketStore.js';
import { currentMarket } from '../intelligence/marketStoreLive.js';
import { leased } from '../ops/leasedLoop.js';

/// Trending-demand nudges, from the one market store (view 48, step 4). A daily
/// pass reads the market categories rising this week and tells each seller who
/// serves one of them: "requests for Design are up this week". Raw keywords were
/// the unit before, and one request gives many near-synonyms, so nothing ever
/// rose. The nudge rides the same Telegram and in-app rails as before. Gated at
/// the call site by TREND_NUDGES_ENABLED.

/// One nudge per seller per this window, even across several rising categories.
const NUDGE_TTL_MS = 72 * 60 * 60 * 1000;
/// Daily cadence. First run fires shortly after boot. Override for tests.
const TICK_MS = Number(process.env.TREND_SCOUT_TICK_MS ?? 24 * 60 * 60 * 1000);
const FIRST_RUN_DELAY_MS = Number(process.env.TREND_SCOUT_FIRST_RUN_DELAY_MS ?? 2 * 60 * 1000);

/// user address -> last nudge ts. Hydrated from event_history on start so the
/// 72h cap holds across restarts (a nudge is durable on the bus).
const lastNudgedAt = new Map<string, number>();

/// The categories a seller serves: those their skills and keywords name, and
/// those of the offers they have open.
export function sellerCategories(words: readonly string[], listingCategories: readonly CategoryId[]): Set<CategoryId> {
  const out = new Set<CategoryId>(listingCategories);
  for (const w of words) {
    const id = inferCategory(w);
    if (id) out.add(id);
  }
  return out;
}

/// Sellers to tell, each with the rising category they serve (the most
/// requested one first), skipping anyone told in the last 72 hours.
export function sellersToNudge(
  rising: readonly CategoryDemand[],
  sellers: ReadonlyArray<{ user: string; categories: ReadonlySet<CategoryId> }>,
  told: ReadonlyMap<string, number>,
  now: number,
): Array<{ user: string; category: CategoryDemand }> {
  if (rising.length === 0) return [];
  const out: Array<{ user: string; category: CategoryDemand }> = [];
  for (const s of sellers) {
    if (now - (told.get(s.user) ?? 0) < NUDGE_TTL_MS) continue;
    const category = rising.find((r) => s.categories.has(r.id));
    if (category) out.push({ user: s.user, category });
  }
  return out;
}

async function hydrateDedupe(): Promise<void> {
  try {
    const evts = await recentEventsByType(['trend.match'], 500);
    for (const e of evts) {
      const user = (e.payload?.sellerUser as string | undefined)?.toLowerCase();
      if (user && !lastNudgedAt.has(user)) lastNudgedAt.set(user, e.ts);
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'trend nudge dedupe hydrate failed');
  }
}

async function runOnce(): Promise<void> {
  const now = Date.now();
  const rising = currentMarket(now).demand.filter((r) => r.rising);
  if (rising.length === 0) {
    logger.info('trend scout: no rising category this week');
    return;
  }
  for (const [user, ts] of lastNudgedAt) if (now - ts >= NUDGE_TTL_MS) lastNudgedAt.delete(user);

  const listingsBySeller = new Map<string, CategoryId[]>();
  for (const l of listOpenListings()) {
    const id = categoryOf(l);
    if (!id) continue;
    const key = l.sellerUser.toLowerCase();
    listingsBySeller.set(key, [...(listingsBySeller.get(key) ?? []), id]);
  }
  const sellers: Array<{ user: string; categories: Set<CategoryId> }> = [];
  for (const w of await listAllAgentWallets()) {
    const user = w.userAddress.toLowerCase();
    const seller = (await getProfile(w.userAddress))?.seller;
    const words = [...(seller?.skills ?? []), ...(seller?.keywords ?? [])];
    const categories = sellerCategories(words, listingsBySeller.get(user) ?? []);
    if (categories.size > 0) sellers.push({ user, categories });
  }

  const nudges = sellersToNudge(rising, sellers, lastNudgedAt, now);
  for (const { user, category } of nudges) {
    lastNudgedAt.set(user, now);
    bus.emitEvent({
      type: 'trend.match',
      actor: 'platform',
      payload: {
        sellerUser: user,
        category: category.id,
        keyword: category.name,
        count: category.thisWeek,
        delta: category.thisWeek - category.lastWeek,
        matchedKeywords: [category.name],
        windowDays: 7,
      },
    });
  }
  logger.info({ rising: rising.map((r) => `${r.id}:${r.lastWeek}->${r.thisWeek}`), nudged: nudges.length }, 'trend scout nudged sellers on rising demand');
}

/// Start the daily trend scout. Returns a stop function. The first run fires a
/// couple of minutes after boot (once stores have hydrated), then daily.
export function startTrendScout(): () => void {
  let interval: NodeJS.Timeout | null = null;
  const first = setTimeout(() => {
    const run = leased('trendScout', TICK_MS, () =>
      runOnce().catch((err) => logger.error({ err: (err as Error).message }, 'trend scout run failed')),
    );
    void hydrateDedupe().then(() => run());
    interval = setInterval(() => {
      recordHeartbeat('trendScout');
      void run();
    }, TICK_MS);
  }, FIRST_RUN_DELAY_MS);
  logger.info({ tickMs: TICK_MS, firstRunDelayMs: FIRST_RUN_DELAY_MS }, 'trend scout started');
  return () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
