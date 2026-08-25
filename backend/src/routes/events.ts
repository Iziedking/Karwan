import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { bus, type KarwanEvent } from '../events.js';
import { pgEnabled, postgresExecutor, withPostgresTransaction } from '../db/client.js';
import {
  PostgresDomainEventStore,
  domainEventLiveBus,
  domainEventToKarwanEvent,
  type DealRoomStreamRecord,
  type DomainEventV2,
} from '../events/domainEventStore.js';
import { sequenceCursor } from '../events/replayCursor.js';
import { readSession } from '../auth/session.js';
import { listBridgesForUser, bridgeOwnerFromIndex } from '../db/bridges.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { depositWalletsByChainKey } from '../chain/cctpChains.js';
import { logger } from '../logger.js';
import {
  callerJobIds,
  buyerJobIds,
  isBriefPoster,
  AUCTION_INTERNAL_TYPES,
} from '../auth/partyScope.js';

export const eventsRoutes = new Hono();

const durableEventStore = pgEnabled
  ? new PostgresDomainEventStore(postgresExecutor(), withPostgresTransaction)
  : null;

/// The durable replay boundary is deliberately independent from Hono. The
/// browser reconnect path consumes this exact envelope, while the route only
/// supplies authentication-derived projection sets. Keeping the contract
/// pure makes cursor ordering and privacy testable without enabling a second
/// event authority or requiring a live provider.
export interface DurableReplayStore {
  getDealRoom(id: string): Promise<DealRoomStreamRecord | null>;
  findDealRoomByJobId(jobId: string): Promise<DealRoomStreamRecord | null>;
  listAfterSequence(dealRoomId: string, afterSequence: number): Promise<DomainEventV2[]>;
}

export interface ReplayProjectionContext {
  caller: string | null;
  callerJobs: Set<string>;
  buyerJobs: Set<string>;
  callerBridges: Set<string>;
}

export interface DurableReplayEnvelope {
  dealRoomId: string | null;
  afterSequence: number;
  currentSequence: number;
  events: KarwanEvent[];
}

// The live stream and the snapshot are caller-aware: a party to a deal sees the
// full event detail of THAT deal, everyone else sees a privacy pulse (the event
// type, the actor role, and the time, with no parties, amounts, deal id, or
// text). So a raw-stream reader cannot harvest other people's deal detail. The
// caller is the authenticated session (an HMAC-signed cookie), never a
// spoofable query param.
/// `financier` is a party to the FINANCING events on a deal (po.*, factoring.*)
/// without being a party to the deal itself, so the tracked-jobs pass never
/// reaches them. routes/activity.ts has carried this key since the finance lane
/// shipped and this list had not, so a financier watched their own advances and
/// repayments arrive as empty pulses on the live stream while the very same
/// events appeared in the backfill. The two lists have to move together.
const PARTY_KEYS = [
  'buyer',
  'seller',
  'sellerUser',
  'buyerUser',
  'postedBy',
  'financier',
] as const;

/// Keys that name the SINGLE user an event belongs to, for money that moves
/// outside any deal: wallet credits/debits (`owner`), agent funding and
/// withdrawals (`user`), vault stake and yield (`address`). Without these the
/// projection had no way to recognise a personal event, so every one of them
/// reached its own owner as an empty pulse and the UI that listens for them
/// could never fire.
const OWNER_KEYS = ['owner', 'user', 'address'] as const;

function matchesKey(
  e: KarwanEvent,
  caller: string,
  keys: readonly string[],
): boolean {
  const p = e.payload as Record<string, unknown> | undefined;
  if (!p) return false;
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.toLowerCase() === caller) return true;
  }
  return false;
}

function isParty(e: KarwanEvent, caller: string): boolean {
  return matchesKey(e, caller, PARTY_KEYS);
}

/// Whether this event is the caller's OWN money moving. Two ways to know:
/// the payload names them under an owner key, or it carries a bridgeId whose
/// record they own. Bridge events name no party at all, so before this every
/// bridge event was pulsed to `payload: {}` and the client dropped it for
/// having no bridgeId — which is why live bridge progress never worked for
/// anyone.
///
/// `callerBridges` is seeded per stream from the caller's own bridge history;
/// the index covers bridges created after the stream opened. Both resolve
/// ownership from the durable record, never from a self-declared payload
/// field, and an unknown bridge stays a pulse. So this widens visibility only
/// to events the caller could already read from their own bridge history.
function isOwnMoney(
  e: KarwanEvent,
  caller: string,
  callerBridges: Set<string>,
): boolean {
  if (matchesKey(e, caller, OWNER_KEYS)) return true;
  const p = e.payload as Record<string, unknown> | undefined;
  const bridgeId = typeof p?.bridgeId === 'string' ? p.bridgeId : null;
  if (!bridgeId) return false;
  if (callerBridges.has(bridgeId)) return true;
  return bridgeOwnerFromIndex(bridgeId) === caller;
}

function pulse(e: KarwanEvent): KarwanEvent {
  return { type: e.type, actor: e.actor, ts: e.ts, payload: {} };
}

/// Project one event for a caller: full detail when it is their deal (a party
/// event, a follow-up on a deal they are tracked on, or an event on a brief
/// they posted), else a pulse. `callerJobs` accumulates the caller's deal ids
/// so later follow-up events that don't restate the party still pass as full
/// detail. The brief-poster check covers a job posted AFTER the stream was
/// seeded: auction events carry only agent addresses, so without it the buyer
/// would watch their own live auction as pulses.
/// Exported for the projection check in scripts/events-projection-check.ts, which
/// verifies the privacy boundary this function enforces.
export function projectFor(
  e: KarwanEvent,
  caller: string | null,
  callerJobs: Set<string>,
  buyerJobs: Set<string>,
  callerBridges: Set<string> = new Set(),
): KarwanEvent {
  if (!caller) return pulse(e);
  // Their own money moving, outside any deal. Nothing about a deal to scope, so
  // it returns in full and skips the auction-internals check below entirely.
  if (isOwnMoney(e, caller, callerBridges)) return e;
  const jobKey = e.jobId?.toLowerCase();
  const party = isParty(e, caller);
  const tracked =
    !!jobKey && (callerJobs.has(jobKey) || isBriefPoster(jobKey, caller));
  if (party || tracked) {
    if (jobKey) callerJobs.add(jobKey);
    // Seller-side privacy: a caller who is a party but NOT the buyer of this
    // job sees the competitive auction internals as a pulse only. The buyer
    // who ran the auction (brief poster / buyer side of the deal) sees them in
    // full. Their own match + settlement events are not in the internal set
    // and pass through for both sides.
    const isBuyerOfJob =
      !!jobKey && (buyerJobs.has(jobKey) || isBriefPoster(jobKey, caller));
    if (!isBuyerOfJob && AUCTION_INTERNAL_TYPES.has(e.type)) return pulse(e);
    return e;
  }
  return pulse(e);
}

/// The caller's own bridge ids, resolved through the same ownership rule the
/// history endpoint uses. Seeded once per stream so bridges that predate this
/// process (a restart mid-relay) still stream their remaining progress to the
/// person who started them. Failure yields an empty set: no progress is a far
/// smaller harm than showing one user another's transfer.
async function seedCallerBridges(caller: string): Promise<Set<string>> {
  try {
    const wallets = await getAgentWallets(caller);
    const records = await listBridgesForUser({
      owner: caller,
      sourceWalletsByChain: depositWalletsByChainKey(wallets?.bridgeWallets),
    });
    return new Set(records.map((b) => b.bridgeId));
  } catch (err) {
    logger.warn({ caller, err: (err as Error).message }, 'events: bridge seed failed');
    return new Set<string>();
  }
}

/// Seed the caller's deal ids: the durable stores (briefs they posted, deals
/// on either side, match proposals on either side) plus a scan of the recent
/// ring. The durable seed is what makes a fresh stream recognize the caller's
/// live auction; the ring scan only adds recency it may otherwise miss.
async function seedCallerJobs(caller: string): Promise<Set<string>> {
  const set = await callerJobIds(caller);
  for (const e of bus.recent(500)) {
    if (e.jobId && isParty(e, caller)) set.add(e.jobId.toLowerCase());
  }
  return set;
}

/// One-shot JSON snapshot of recent events. Caller-aware: full for the caller's
/// own deals, pulse otherwise. Used from curl/jq during testing and to seed
/// per-deal panels (where the caller is a party, so they get full detail).
eventsRoutes.get('/recent', async (c) => {
  const limitParam = c.req.query('limit');
  const limit = Math.min(500, Math.max(1, Number(limitParam ?? 100) || 100));
  const jobId = c.req.query('jobId') ?? undefined;
  const type = c.req.query('type') ?? undefined;
  const caller = readSession(c)?.address?.toLowerCase() ?? null;

  let events = bus.recent(limit, jobId);
  if (type) {
    const types = new Set(type.split(',').map((s) => s.trim()).filter(Boolean));
    events = events.filter((e) => types.has(e.type));
  }
  // Party membership: the durable stores plus this result set. Auction events
  // name only agent addresses, so the payload scan alone misses the caller's
  // own live auction.
  const [callerJobs, buyerJobs, callerBridges] = caller
    ? await Promise.all([callerJobIds(caller), buyerJobIds(caller), seedCallerBridges(caller)])
    : [new Set<string>(), new Set<string>(), new Set<string>()];
  if (caller) {
    for (const e of events) {
      if (e.jobId && isParty(e, caller)) callerJobs.add(e.jobId.toLowerCase());
    }
  }
  return c.json({
    events: events.map((e) => projectFor(e, caller, callerJobs, buyerJobs, callerBridges)),
  });
});

async function replayProjectionContext(caller: string | null) {
  return caller
    ? Promise.all([callerJobIds(caller), buyerJobIds(caller), seedCallerBridges(caller)])
    : Promise.resolve([new Set<string>(), new Set<string>(), new Set<string>()] as const);
}

function canReplayJob(caller: string | null, jobId: string, callerJobs: Set<string>): boolean {
  if (!caller) return false;
  const jobKey = jobId.toLowerCase();
  return callerJobs.has(jobKey) || isBriefPoster(jobKey, caller);
}

function safeReplayCursor(afterSequence: number): number {
  return Math.max(0, Math.floor(afterSequence) || 0);
}

async function replayRoom(
  store: DurableReplayStore,
  room: DealRoomStreamRecord,
  afterSequence: number,
  context: ReplayProjectionContext,
): Promise<DurableReplayEnvelope> {
  const safeAfter = safeReplayCursor(afterSequence);
  const events = await store.listAfterSequence(room.id, safeAfter);
  return {
    dealRoomId: room.id,
    afterSequence: safeAfter,
    currentSequence: room.lastSequence,
    events: events.map((event) =>
      projectFor(
        domainEventToKarwanEvent(event),
        context.caller,
        context.callerJobs,
        context.buyerJobs,
        context.callerBridges,
      ),
    ),
  };
}

/// Build the per-job replay envelope used by browser reconnect. Missing or
/// unauthorized rooms intentionally collapse to the same empty response so a
/// caller cannot probe another user's durable room existence.
export async function buildJobReplayEnvelope(
  store: DurableReplayStore,
  jobId: string,
  afterSequence: number,
  context: ReplayProjectionContext,
): Promise<DurableReplayEnvelope> {
  const safeAfter = safeReplayCursor(afterSequence);
  const room = await store.findDealRoomByJobId(jobId);
  if (!room || !canReplayJob(context.caller, room.jobId, context.callerJobs)) {
    return { dealRoomId: null, afterSequence: safeAfter, currentSequence: safeAfter, events: [] };
  }
  return replayRoom(store, room, safeAfter, context);
}

/// Build the room-scoped replay envelope. The route maps a null result to its
/// existing 404, preserving the privacy boundary for direct room requests.
export async function buildDealRoomReplayEnvelope(
  store: DurableReplayStore,
  dealRoomId: string,
  afterSequence: number,
  context: ReplayProjectionContext,
): Promise<DurableReplayEnvelope | null> {
  const room = await store.getDealRoom(dealRoomId);
  if (!room || !canReplayJob(context.caller, room.jobId, context.callerJobs)) return null;
  return replayRoom(store, room, afterSequence, context);
}

eventsRoutes.get('/deal-rooms/:dealRoomId/replay', async (c) => {
  if (!durableEventStore) return c.json({ error: 'Durable replay is unavailable.' }, 503);
  const dealRoomId = c.req.param('dealRoomId');
  const afterSequence = sequenceCursor(c.req.query('afterSequence'));
  const caller = readSession(c)?.address?.toLowerCase() ?? null;
  const [callerJobs, buyerJobs, callerBridges] = await replayProjectionContext(caller);
  const replay = await buildDealRoomReplayEnvelope(durableEventStore, dealRoomId, afterSequence, {
    caller,
    callerJobs,
    buyerJobs,
    callerBridges,
  });
  return replay ? c.json(replay) : c.json({ error: 'Deal room not found.' }, 404);
});

eventsRoutes.get('/replay', async (c) => {
  if (!durableEventStore) return c.json({ error: 'Durable replay is unavailable.' }, 503);
  const jobId = c.req.query('jobId');
  if (!jobId) return c.json({ error: 'jobId is required.' }, 400);
  const afterSequence = sequenceCursor(c.req.query('afterSequence'));
  const caller = readSession(c)?.address?.toLowerCase() ?? null;
  const [callerJobs, buyerJobs, callerBridges] = await replayProjectionContext(caller);
  return c.json(await buildJobReplayEnvelope(durableEventStore, jobId, afterSequence, {
    caller,
    callerJobs,
    buyerJobs,
    callerBridges,
  }));
});

eventsRoutes.get('/', async (c) => {
  const caller = readSession(c)?.address?.toLowerCase() ?? null;
  const [callerJobs, buyerJobs, callerBridges] = caller
    ? await Promise.all([seedCallerJobs(caller), buyerJobIds(caller), seedCallerBridges(caller)])
    : [new Set<string>(), new Set<string>(), new Set<string>()];

  const dealRoomId = c.req.query('dealRoomId');
  if (dealRoomId && !durableEventStore) {
    return c.json({ error: 'Durable replay is unavailable.' }, 503);
  }
  if (dealRoomId && durableEventStore) {
    const room = await durableEventStore.getDealRoom(dealRoomId);
    if (!room) return c.json({ error: 'Deal room not found.' }, 404);
    if (!canReplayJob(caller, room.jobId, callerJobs)) {
      return c.json({ error: 'Deal room not found.' }, 404);
    }
    const afterSequence = Math.max(
      sequenceCursor(c.req.header('Last-Event-ID')),
      sequenceCursor(c.req.query('afterSequence')),
    );
    return streamSSE(c, async (stream) => {
      let lastSequence = afterSequence;
      const queue: ReturnType<typeof domainEventToKarwanEvent>[] = [];
      let resolveWait: (() => void) | null = null;
      const unsub = domainEventLiveBus.subscribe((event) => {
        if (event.aggregateId !== dealRoomId || event.sequence <= lastSequence) return;
        queue.push(domainEventToKarwanEvent(event));
        resolveWait?.();
        resolveWait = null;
      });

      try {
        const replay = await durableEventStore.listAfterSequence(dealRoomId, lastSequence);
        await stream.writeSSE({
          event: 'open',
          data: JSON.stringify({ ok: true, dealRoomId, afterSequence: lastSequence }),
        });
        for (const event of replay) {
          if (event.sequence <= lastSequence) continue;
          const projected = projectFor(
            domainEventToKarwanEvent(event),
            caller,
            callerJobs,
            buyerJobs,
            callerBridges,
          );
          await stream.writeSSE({
            id: String(event.sequence),
            event: 'karwan',
            data: JSON.stringify(projected),
          });
          lastSequence = event.sequence;
        }

        while (true) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              resolveWait = resolve;
              setTimeout(resolve, 15_000);
            });
          }
          queue.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
          while (queue.length > 0) {
            const event = queue.shift()!;
            if ((event.sequence ?? 0) <= lastSequence) continue;
            const projected = projectFor(
              event,
              caller,
              callerJobs,
              buyerJobs,
              callerBridges,
            );
            await stream.writeSSE({
              id: String(event.sequence),
              event: 'karwan',
              data: JSON.stringify(projected),
            });
            lastSequence = event.sequence ?? lastSequence;
          }
          await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
        }
      } finally {
        unsub();
      }
    });
  }

  return streamSSE(c, async (stream) => {
    let id = 0;
    const queue: KarwanEvent[] = [];
    let resolveWait: (() => void) | null = null;

    const wake = () => {
      resolveWait?.();
      resolveWait = null;
    };
    const unsub = bus.subscribe((e) => {
      // Private support replies go to the user over Telegram + their own ticket
      // poll, never the public broadcast (which every client receives).
      if (e.type === 'support.reply') return;
      queue.push(e);
      wake();
    });
    const unsubDurable = domainEventLiveBus.subscribe((event) => {
      queue.push(domainEventToKarwanEvent(event));
      wake();
    });

    await stream.writeSSE({ event: 'open', data: JSON.stringify({ ok: true }) });

    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolveWait = r;
            setTimeout(r, 15_000);
          });
        }
        while (queue.length > 0) {
          const e = queue.shift()!;
          id += 1;
          // All data events ride ONE fixed SSE name; the real type is inside the
          // JSON payload (`.type`), and the client dispatches on that. Sending
          // per-type named events required the client to pre-register a listener
          // for every type, and that hand-maintained list drifted out of sync
          // with the backend union, so newer types (market.scanned, deadline
          // passed, tier-up, ...) were silently dropped from the live feed and
          // only appeared on a manual refresh.
          await stream.writeSSE({
            id: String(id),
            event: 'karwan',
            data: JSON.stringify(projectFor(e, caller, callerJobs, buyerJobs, callerBridges)),
          });
        }
        await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
      }
    } finally {
      unsub();
      unsubDurable();
    }
  });
});
