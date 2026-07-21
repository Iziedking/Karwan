import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { bus, type KarwanEvent } from '../events.js';
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

// The live stream and the snapshot are caller-aware: a party to a deal sees the
// full event detail of THAT deal, everyone else sees a privacy pulse (the event
// type, the actor role, and the time, with no parties, amounts, deal id, or
// text). So a raw-stream reader cannot harvest other people's deal detail. The
// caller is the authenticated session (an HMAC-signed cookie), never a
// spoofable query param.
const PARTY_KEYS = ['buyer', 'seller', 'sellerUser', 'buyerUser', 'postedBy'] as const;

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

eventsRoutes.get('/', async (c) => {
  const caller = readSession(c)?.address?.toLowerCase() ?? null;
  const [callerJobs, buyerJobs, callerBridges] = caller
    ? await Promise.all([seedCallerJobs(caller), buyerJobIds(caller), seedCallerBridges(caller)])
    : [new Set<string>(), new Set<string>(), new Set<string>()];
  return streamSSE(c, async (stream) => {
    let id = 0;
    const queue: KarwanEvent[] = [];
    let resolveWait: (() => void) | null = null;

    const unsub = bus.subscribe((e) => {
      // Private support replies go to the user over Telegram + their own ticket
      // poll, never the public broadcast (which every client receives).
      if (e.type === 'support.reply') return;
      queue.push(e);
      resolveWait?.();
      resolveWait = null;
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
    }
  });
});
