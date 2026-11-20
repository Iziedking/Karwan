import { logger } from '../logger.js';
import { meaningOn } from './meaning.js';
import { meaningKeeper, type MeaningKeeper } from './meaningKeeper.js';
import { sellerIndex, type IndexedSeller } from './sellerIndex.js';

/// How meaning vectors join the market (view 95 phase 2). The seller index
/// tells the keeper when sellers change; a posted request asks for its own
/// vector and waits a moment at most. With the switch off nothing here calls
/// a model and every match runs on words, the word map and the judge.

/// The most a posted request or a find waits for its vector.
export const REQUEST_MEANING_WAIT_MS = 1500;

const onTheMarket = (s: IndexedSeller) => s.onMarket && !s.example;

/// Hears the seller index: the first rebuild loads saved vectors and fills in
/// the missing ones in the background; each saved profile is embedded again
/// when its text changed. Returns the way to stop.
export function startMeaning(
  deps: { keeper: MeaningKeeper; index: Pick<typeof sellerIndex, 'listen'>; on: () => boolean } = { keeper: meaningKeeper, index: sellerIndex, on: () => meaningOn() },
): () => void {
  let loaded = false;
  return deps.index.listen((entries, how) => {
    if (!deps.on()) return;
    if (how === 'refresh') {
      for (const s of entries.filter(onTheMarket)) {
        void deps.keeper.ensure({ kind: 'seller', ref: s.userAddress, owner: s.userAddress, text: s.text }).catch(() => undefined);
      }
      return;
    }
    if (loaded) return;
    loaded = true;
    const items = entries.filter(onTheMarket).map((s) => ({ ref: s.userAddress, owner: s.userAddress, text: s.text }));
    void (async () => {
      const held = await deps.keeper.load();
      const { made, failed } = await deps.keeper.backfill(items);
      logger.info({ held, made, failed, sellers: items.length }, 'meaning vectors ready');
    })().catch((err) => {
      loaded = false;
      logger.warn({ error: (err as Error)?.name ?? 'Error' }, 'meaning vectors could not load');
    });
  });
}

/// A posted or edited request: its vector within 1.5 s, and how close each seller is.
export async function requestMeaning(keeper: MeaningKeeper, jobId: string, buyer: string, text: string): Promise<((user: string) => number) | undefined> {
  if (!text.trim()) return undefined;
  const q = await keeper.query(text, { timeoutMs: REQUEST_MEANING_WAIT_MS, save: { kind: 'request', ref: jobId, owner: buyer.toLowerCase() } }).catch(() => null);
  return keeper.scorer(q, 'seller');
}

/// A seller who just saved: how close each open request is to what they sell.
export function sellerMeaning(keeper: MeaningKeeper, user: string): ((jobId: string) => number) | undefined {
  return keeper.scorer(keeper.vectorOf('seller', user.toLowerCase()), 'request');
}
