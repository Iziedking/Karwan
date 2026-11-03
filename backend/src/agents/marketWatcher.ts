import { listAllBriefs } from '../db/briefs.js';
import { allLiveWatches, saveWatch } from '../db/marketWatches.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { CATEGORY_NAMES } from '../listings/categories.js';
import { categoryOfRequest } from '../intelligence/marketStore.js';
import { currentMarket } from '../intelligence/marketStoreLive.js';
import { checkWatch } from '../intelligence/watches.js';

/// The sweep behind watch_market (view 48, step 5). Every half hour each live
/// watch is compared with the market as it is now, and its owner hears once
/// per change, in the app and on Telegram.

const TICK_MS = Number(process.env.MARKET_WATCH_TICK_MS ?? 30 * 60 * 1000);

export async function sweepWatches(now = Date.now()): Promise<number> {
  const watches = await allLiveWatches(now);
  if (watches.length === 0) return 0;
  const market = currentMarket(now);
  const requests = listAllBriefs()
    .filter((b) => !b.seedKey)
    .map((b) => ({ jobId: b.jobId, category: categoryOfRequest(b), postedAt: b.createdAt }));
  let told = 0;
  for (const w of watches) {
    const { hit, watch } = checkWatch(w, market, requests, now);
    await saveWatch(watch).catch((err: Error) => logger.warn({ err: err.message, watch: w.id }, 'market watch not saved'));
    if (!hit) continue;
    told += 1;
    bus.emitEvent({
      type: 'market.watch',
      actor: 'platform',
      // `user` reaches Telegram; `sellerUser` is how the app addresses a personal notice.
      payload: { user: w.owner, sellerUser: w.owner, watchId: w.id, category: w.category, categoryName: CATEGORY_NAMES[w.category], ...hit },
    });
  }
  return told;
}

export function startMarketWatcher(): () => void {
  const timer = setInterval(() => {
    sweepWatches().catch((err: Error) => logger.error({ err: err.message }, 'market watch sweep failed'));
  }, TICK_MS);
  logger.info({ tickMs: TICK_MS }, 'market watcher started');
  return () => clearInterval(timer);
}
