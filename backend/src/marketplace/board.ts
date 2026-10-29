import { encodeAbiParameters, keccak256, toHex, type Address, type Hex, type Log } from 'viem';
import type { BoardChange, BoardEvent, BoardRow, BoardStore, StoredBoardEvent } from '../db/marketBoard.js';

export type { BoardEvent } from '../db/marketBoard.js';

/// Where the market's requests, offers and counters are kept (view 40, part
/// A). The old request board did it with a transaction per step; Karwan keeps
/// the same rules, request numbers and event shapes in its own records, so the
/// agents run unchanged. `MARKET_BOARD=chain` goes back to the old board.

export interface BoardRequest {
  buyer: Address;
  budget: bigint;
  deadline: bigint;
  termsHash: string;
  /// None, Posted, Accepted, Cancelled, Expired.
  state: 0 | 1 | 2 | 3 | 4;
  acceptedSeller: Address;
  acceptedPrice: bigint;
  acceptedDeadline: bigint;
}

export interface MarketBoard {
  readonly kind: 'chain' | 'karwan';
  postRequest(i: { walletId: string; poster: Address; salt: Hex; budget: bigint; deadline: bigint; termsHash: string }): Promise<{ jobId: Hex; ref: string }>;
  placeOffer(i: { walletId: string; seller: Address; jobId: Hex; price: bigint; deadline: bigint }): Promise<{ ref: string }>;
  counter(i: { walletId: string; buyer: Address; jobId: Hex; seller: Address; price: bigint; deadline: bigint }): Promise<{ ref: string }>;
  respond(i: { walletId: string; seller: Address; jobId: Hex; accept: boolean; price: bigint; deadline: bigint }): Promise<{ ref: string }>;
  accept(i: { walletId: string; buyer: Address; jobId: Hex; seller: Address }): Promise<{ ref: string }>;
  read(jobId: Hex): Promise<BoardRequest | null>;
  /// Requests posted lately, as `JobPosted` logs, for the agents' catch-up
  /// sweeps: the last `blocks` on the old board, the last `ms` on Karwan's.
  recentPosted(lookback: { blocks: bigint; ms: number }): Promise<Log[]>;
  watch(event: BoardEvent, onLogs: (logs: Log[]) => void, onError: (e: Error) => void): () => void;
}

/// A refusal, named as the old board's revert.
export class BoardError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const boardJobId = (poster: Address, salt: Hex): Hex =>
  keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [poster, salt]));

/// Reads of the old board, for requests posted there before the switch.
export interface ChainBoardReads {
  request(jobId: Hex): Promise<BoardRequest | null>;
  offer(jobId: Hex, seller: Address): Promise<{ price: bigint; deadline: bigint } | null>;
  counter(jobId: Hex, seller: Address): Promise<{ price: bigint; deadline: bigint } | null>;
}

const ZERO: Address = '0x0000000000000000000000000000000000000000';
const AMOUNTS = new Set(['budget', 'deadline', 'price', 'newPrice', 'newDeadline']);
const lower = (a: string) => a.toLowerCase();

export const boardRef = (eventId: number): Hex => keccak256(toHex(`board:${eventId}`));

function toRequest(r: BoardRow): BoardRequest {
  return {
    buyer: r.buyer,
    budget: BigInt(r.budget),
    deadline: BigInt(r.deadline),
    termsHash: r.termsHash,
    state: r.state,
    acceptedSeller: r.acceptedSeller ?? ZERO,
    acceptedPrice: BigInt(r.acceptedPrice),
    acceptedDeadline: BigInt(r.acceptedDeadline),
  };
}

function fromChain(jobId: Hex, r: BoardRequest): BoardRow {
  return {
    jobId,
    buyer: r.buyer,
    budget: r.budget.toString(),
    deadline: r.deadline.toString(),
    termsHash: r.termsHash,
    state: r.state,
    acceptedSeller: r.acceptedSeller === ZERO ? null : r.acceptedSeller,
    acceptedPrice: r.acceptedPrice.toString(),
    acceptedDeadline: r.acceptedDeadline.toString(),
    offers: {},
    counters: {},
    fromChain: true,
  };
}

/// The event as the old board's watcher delivered it: same fields and types,
/// a transaction hash and log index that never repeat.
export function boardLog(e: StoredBoardEvent): Log {
  const args = Object.fromEntries(
    Object.entries(e.args).map(([k, v]) => [k, AMOUNTS.has(k) ? BigInt(v as string) : v]),
  );
  return {
    address: ZERO,
    blockHash: null,
    blockNumber: BigInt(e.id),
    data: '0x',
    logIndex: 0,
    transactionHash: boardRef(e.id),
    transactionIndex: 0,
    removed: false,
    topics: [],
    eventName: e.kind,
    args,
  } as unknown as Log;
}

interface Watcher {
  kind: BoardEvent;
  onLogs: (logs: Log[]) => void;
  onError: (e: Error) => void;
  cursor?: number;
}

export function createKarwanBoard(deps: {
  store: BoardStore;
  chain: ChainBoardReads;
  /// Seconds.
  now: () => number;
  pollMs?: number;
}): MarketBoard & { ready(): Promise<void>; pollOnce(): Promise<void> } {
  const { store, chain } = deps;
  const watchers = new Set<Watcher>();
  const starting = new Set<Promise<void>>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let polling: Promise<void> | null = null;
  let again = false;

  const now = () => BigInt(deps.now());

  async function rowFor(jobId: Hex): Promise<BoardRow | null> {
    const kept = await store.get(jobId);
    if (kept) return kept;
    const old = await chain.request(jobId);
    if (!old || old.state === 0) return null;
    await store.seed(fromChain(jobId, old));
    return store.get(jobId);
  }

  async function change(jobId: Hex, apply: (row: BoardRow | null) => BoardChange): Promise<string> {
    let eventId: number;
    try {
      ({ eventId } = await store.update(jobId, apply));
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (err instanceof BoardError) throw err;
      if (code === 'JobAlreadyExists') throw new BoardError('JobAlreadyExists');
      throw err;
    }
    void pollOnce();
    return boardRef(eventId);
  }

  const open = (row: BoardRow | null): BoardRow => {
    if (!row || row.state !== 1) throw new BoardError('JobNotOpen');
    return row;
  };

  async function drain(): Promise<void> {
    do {
      again = false;
      const live = [...watchers].filter((w) => w.cursor !== undefined);
      if (live.length === 0) return;
      const from = Math.min(...live.map((w) => w.cursor!));
      const events = await store.eventsAfter(from, 500);
      if (events.length === 0) continue;
      const last = events[events.length - 1]!.id;
      for (const w of live) {
        const mine = events.filter((e) => e.id > w.cursor! && e.kind === w.kind).map(boardLog);
        w.cursor = Math.max(w.cursor!, last);
        if (mine.length === 0) continue;
        try {
          w.onLogs(mine);
        } catch (err) {
          w.onError(err as Error);
        }
      }
      if (events.length === 500) again = true;
    } while (again);
  }

  function pollOnce(): Promise<void> {
    if (polling) {
      again = true;
      return polling;
    }
    polling = drain()
      .catch((err) => {
        for (const w of watchers) w.onError(err as Error);
      })
      .finally(() => {
        polling = null;
      });
    return polling;
  }

  return {
    kind: 'karwan',

    async postRequest(i) {
      const jobId = boardJobId(i.poster, i.salt);
      if (i.budget === 0n || i.deadline <= now()) throw new BoardError('InvalidJob');
      if (await chain.request(jobId)) throw new BoardError('JobAlreadyExists');
      const ref = await change(jobId, (row) => {
        if (row) throw new BoardError('JobAlreadyExists');
        return {
          row: {
            jobId,
            buyer: i.poster,
            budget: i.budget.toString(),
            deadline: i.deadline.toString(),
            termsHash: i.termsHash,
            state: 1,
            acceptedSeller: null,
            acceptedPrice: '0',
            acceptedDeadline: '0',
            offers: {},
            counters: {},
          },
          event: { kind: 'JobPosted', args: { jobId, buyer: i.poster, budget: i.budget, deadline: i.deadline, termsHash: i.termsHash } },
        };
      });
      return { jobId, ref };
    },

    async placeOffer(i) {
      await rowFor(i.jobId);
      const ref = await change(i.jobId, (current) => {
        const row = open(current);
        if (i.price === 0n || i.deadline <= now()) throw new BoardError('InvalidBid');
        row.offers[lower(i.seller)] = { seller: i.seller, price: i.price.toString(), deadline: i.deadline.toString() };
        return { row, event: { kind: 'BidSubmitted', args: { jobId: i.jobId, seller: i.seller, price: i.price, deadline: i.deadline } } };
      });
      return { ref };
    },

    async counter(i) {
      const kept = await rowFor(i.jobId);
      const old = kept?.fromChain && !kept.offers[lower(i.seller)] ? await chain.offer(i.jobId, i.seller) : null;
      const ref = await change(i.jobId, (current) => {
        const row = open(current);
        if (lower(i.buyer) !== lower(row.buyer)) throw new BoardError('NotJobBuyer');
        if (!row.offers[lower(i.seller)] && old) {
          row.offers[lower(i.seller)] = { seller: i.seller, price: old.price.toString(), deadline: old.deadline.toString() };
        }
        if (!row.offers[lower(i.seller)]) throw new BoardError('NoSuchBid');
        if (i.price === 0n || i.deadline <= now()) throw new BoardError('InvalidCounter');
        row.counters[lower(i.seller)] = { price: i.price.toString(), deadline: i.deadline.toString() };
        return { row, event: { kind: 'CounterOfferIssued', args: { jobId: i.jobId, seller: i.seller, newPrice: i.price, newDeadline: i.deadline } } };
      });
      return { ref };
    },

    async respond(i) {
      const kept = await rowFor(i.jobId);
      const s = lower(i.seller);
      const oldCounter = kept?.fromChain && !kept.counters[s] ? await chain.counter(i.jobId, i.seller) : null;
      const oldOffer = kept?.fromChain && !kept.offers[s] ? await chain.offer(i.jobId, i.seller) : null;
      const ref = await change(i.jobId, (current) => {
        const row = open(current);
        if (!row.counters[s] && oldCounter) row.counters[s] = { price: oldCounter.price.toString(), deadline: oldCounter.deadline.toString() };
        if (!row.offers[s] && oldOffer) row.offers[s] = { seller: i.seller, price: oldOffer.price.toString(), deadline: oldOffer.deadline.toString() };
        const c = row.counters[s];
        if (!c) throw new BoardError('NoSuchBid');
        if (i.accept) {
          row.offers[s] = { seller: row.offers[s]?.seller ?? i.seller, price: c.price, deadline: c.deadline };
          return {
            row,
            event: { kind: 'CounterResponse', args: { jobId: i.jobId, seller: i.seller, accepted: true, newPrice: BigInt(c.price), newDeadline: BigInt(c.deadline) } },
          };
        }
        if (i.price === 0n || i.deadline <= now()) throw new BoardError('InvalidCounter');
        row.counters[s] = { price: i.price.toString(), deadline: i.deadline.toString() };
        return {
          row,
          event: { kind: 'CounterResponse', args: { jobId: i.jobId, seller: i.seller, accepted: false, newPrice: i.price, newDeadline: i.deadline } },
        };
      });
      return { ref };
    },

    async accept(i) {
      const kept = await rowFor(i.jobId);
      const s = lower(i.seller);
      const old = kept?.fromChain && !kept.offers[s] ? await chain.offer(i.jobId, i.seller) : null;
      const ref = await change(i.jobId, (current) => {
        const row = open(current);
        if (lower(i.buyer) !== lower(row.buyer)) throw new BoardError('NotJobBuyer');
        if (BigInt(row.deadline) <= now()) throw new BoardError('MatchWindowClosed');
        if (!row.offers[s] && old) row.offers[s] = { seller: i.seller, price: old.price.toString(), deadline: old.deadline.toString() };
        const b = row.offers[s];
        if (!b) throw new BoardError('NoSuchBid');
        if (BigInt(b.deadline) <= now()) throw new BoardError('BidExpired');
        row.state = 2;
        row.acceptedSeller = b.seller;
        row.acceptedPrice = b.price;
        row.acceptedDeadline = b.deadline;
        return {
          row,
          event: { kind: 'BidAccepted', args: { jobId: i.jobId, seller: b.seller, price: BigInt(b.price), deadline: BigInt(b.deadline) } },
        };
      });
      return { ref };
    },

    async read(jobId) {
      const kept = await store.get(jobId);
      if (kept) return toRequest(kept);
      return chain.request(jobId);
    },

    async recentPosted({ ms }) {
      return (await store.postedSince(deps.now() * 1000 - ms)).map(boardLog);
    },

    watch(kind, onLogs, onError) {
      const w: Watcher = { kind, onLogs, onError };
      watchers.add(w);
      const start = store
        .latestEventId()
        .then((id) => {
          w.cursor = id;
        })
        .catch((err) => onError(err as Error))
        .finally(() => starting.delete(start));
      starting.add(start);
      if (!timer && deps.pollMs) {
        timer = setInterval(() => void pollOnce(), deps.pollMs);
        timer.unref?.();
      }
      return () => {
        watchers.delete(w);
        if (watchers.size === 0 && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    },

    async ready() {
      await Promise.all([...starting]);
    },

    pollOnce,
  };
}
