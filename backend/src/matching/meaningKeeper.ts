import { config } from '../config.js';
import * as liveStore from '../db/meaningVectors.js';
import type { MeaningKind } from '../db/meaningVectors.js';
import { EMBED_BATCH_MAX, embedTexts, type InputType } from '../llm/embedder.js';
import { meaningOn, meaningScore, modelKey, textHash } from './meaning.js';

/// The meaning vectors in memory (view 95 phase 2), beside the seller index.
/// Sellers are embedded as documents when their text changes; requests,
/// standing orders and finds as queries when they are asked. Every vector is
/// saved with its model, and a vector from another model is never used.

export interface KeeperDeps {
  on(): boolean;
  model(): string | null;
  threshold(): number;
  embed(texts: string[], inputType: InputType, timeoutMs?: number): Promise<Float32Array[] | null>;
  store: Pick<typeof liveStore, 'putVector' | 'getVector' | 'listVectors' | 'deleteVectorsOf'>;
  now(): number;
  gapMs: number;
  sleep(ms: number): Promise<void>;
}

interface Held {
  model: string;
  hash: string;
  owner: string;
  vector: Float32Array;
}

const QUERY_CACHE_MAX = 500;

export function createMeaningKeeper(deps: KeeperDeps) {
  const held = new Map<string, Held>();
  const queries = new Map<string, Float32Array>();
  /// The newest call per key, and when each owner was forgotten, on one clock.
  const latest = new Map<string, number>();
  const forgotten = new Map<string, number>();
  let clock = 0;

  const keyOf = (kind: MeaningKind, ref: string) => `${kind}\u0000${ref}`;
  const live = () => (deps.on() ? deps.model() : null);
  const stale = (key: string, owner: string, ticket: number) =>
    latest.get(key) !== ticket || (forgotten.get(owner.toLowerCase()) ?? -1) > ticket;

  function cacheQuery(hash: string, v: Float32Array) {
    queries.delete(hash);
    queries.set(hash, v);
    if (queries.size > QUERY_CACHE_MAX) queries.delete(queries.keys().next().value!);
  }

  async function keep(kind: MeaningKind, ref: string, owner: string, hash: string, vector: Float32Array, model: string, ticket: number) {
    const key = keyOf(kind, ref);
    if (stale(key, owner, ticket)) return false;
    held.set(key, { model, hash, owner: owner.toLowerCase(), vector });
    await deps.store.putVector({ kind, ref, model, owner, textHash: hash, vector, updatedAt: deps.now() });
    return true;
  }

  /// A current vector for this key and text, from memory or the store.
  async function current(kind: MeaningKind, ref: string, hash: string, model: string): Promise<Float32Array | null> {
    const key = keyOf(kind, ref);
    const mem = held.get(key);
    if (mem && mem.model === model && mem.hash === hash) return mem.vector;
    const saved = await deps.store.getVector(kind, ref, model).catch(() => null);
    if (saved && saved.textHash === hash) {
      held.set(key, { model, hash, owner: saved.owner, vector: saved.vector });
      return saved.vector;
    }
    return null;
  }

  const keeper = {
    /// Reads the sellers' vectors for the current model. Returns how many.
    async load(): Promise<number> {
      const model = live();
      if (!model) return 0;
      const rows = await deps.store.listVectors('seller', model);
      for (const r of rows) held.set(keyOf('seller', r.ref), { model, hash: r.textHash, owner: r.owner, vector: r.vector });
      return rows.length;
    },

    vectorOf(kind: MeaningKind, ref: string): Float32Array | null {
      const model = live();
      const mem = model ? held.get(keyOf(kind, ref)) : undefined;
      return mem && mem.model === model ? mem.vector : null;
    },

    /// A seller's text changed or is new: embed it once.
    async ensure(item: { kind: MeaningKind; ref: string; owner: string; text: string }): Promise<void> {
      const model = live();
      if (!model || !item.text.trim()) return;
      const hash = textHash(item.text);
      const key = keyOf(item.kind, item.ref);
      const ticket = ++clock;
      latest.set(key, ticket);
      if (await current(item.kind, item.ref, hash, model)) return;
      const type: InputType = item.kind === 'seller' ? 'search_document' : 'search_query';
      const got = await deps.embed([item.text], type);
      if (got?.[0]) await keep(item.kind, item.ref, item.owner, hash, got[0], model, ticket);
    },

    /// A request, standing order or find: one vector, within the time limit, or null.
    async query(text: string, opts: { timeoutMs: number; save?: { kind: 'request' | 'need'; ref: string; owner: string } }): Promise<Float32Array | null> {
      const model = live();
      if (!model || !text.trim()) return null;
      const hash = textHash(text);
      const ticket = ++clock;
      if (opts.save) {
        latest.set(keyOf(opts.save.kind, opts.save.ref), ticket);
        const saved = await current(opts.save.kind, opts.save.ref, hash, model);
        if (saved) return saved;
      }
      let v = queries.get(hash) ?? null;
      if (!v) {
        const got = await deps.embed([text], 'search_query', opts.timeoutMs);
        v = got?.[0] ?? null;
        if (!v) return null;
        cacheQuery(hash, v);
      }
      if (opts.save) await keep(opts.save.kind, opts.save.ref, opts.save.owner, hash, v, model, ticket).catch(() => false);
      return v;
    },

    /// Sellers with no current vector, in paced batches. A failed batch waits for the next pass.
    async backfill(items: { ref: string; owner: string; text: string }[]): Promise<{ made: number; failed: number }> {
      let made = 0;
      let failed = 0;
      const model = live();
      if (!model) return { made, failed };
      const todo = items.filter((i) => {
        if (!i.text.trim()) return false;
        const mem = held.get(keyOf('seller', i.ref));
        return !(mem && mem.model === model && mem.hash === textHash(i.text));
      });
      for (let i = 0; i < todo.length; i += EMBED_BATCH_MAX) {
        if (live() !== model) break;
        if (i > 0) await deps.sleep(deps.gapMs);
        const chunk = todo.slice(i, i + EMBED_BATCH_MAX);
        const tickets = chunk.map((c) => {
          const t = ++clock;
          latest.set(keyOf('seller', c.ref), t);
          return t;
        });
        const got = await deps.embed(chunk.map((c) => c.text), 'search_document');
        if (!got) {
          failed += chunk.length;
          continue;
        }
        for (let j = 0; j < chunk.length; j++) {
          const c = chunk[j]!;
          if (await keep('seller', c.ref, c.owner, textHash(c.text), got[j]!, model, tickets[j]!)) made += 1;
        }
      }
      return { made, failed };
    },

    /// How close each ref of a kind is to the query, 0 to 100. Undefined when off.
    scorer(query: Float32Array | null, kind: MeaningKind): ((ref: string) => number) | undefined {
      if (!query || !live()) return undefined;
      const t = deps.threshold();
      return (ref) => meaningScore(query, keeper.vectorOf(kind, ref), t);
    },

    /// An account is deleted: its vectors go, and replies still on the way are dropped.
    async forget(owner: string): Promise<void> {
      const who = owner.toLowerCase();
      forgotten.set(who, ++clock);
      for (const [k, v] of held) if (v.owner === who) held.delete(k);
      await deps.store.deleteVectorsOf(who);
    },

    counts(): { model: string | null; sellers: number } {
      const model = live();
      let sellers = 0;
      if (model) for (const [k, v] of held) if (k.startsWith('seller\u0000') && v.model === model) sellers += 1;
      return { model, sellers };
    },
  };
  return keeper;
}

export type MeaningKeeper = ReturnType<typeof createMeaningKeeper>;

export const meaningKeeper: MeaningKeeper = createMeaningKeeper({
  on: () => meaningOn(),
  model: () => modelKey(),
  threshold: () => config.MEANING_THRESHOLD ?? 1,
  embed: (texts, inputType, timeoutMs) => embedTexts(texts, inputType, timeoutMs ? { timeoutMs } : {}),
  store: liveStore,
  now: () => Date.now(),
  gapMs: config.MEANING_BATCH_GAP_MS,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});
