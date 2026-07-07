import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { bus, type KarwanEvent } from '../events.js';
import { readSession } from '../auth/session.js';
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

function isParty(e: KarwanEvent, caller: string): boolean {
  const p = e.payload as Record<string, unknown> | undefined;
  if (!p) return false;
  for (const k of PARTY_KEYS) {
    const v = p[k];
    if (typeof v === 'string' && v.toLowerCase() === caller) return true;
  }
  return false;
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
function projectFor(
  e: KarwanEvent,
  caller: string | null,
  callerJobs: Set<string>,
  buyerJobs: Set<string>,
): KarwanEvent {
  if (!caller) return pulse(e);
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
  const [callerJobs, buyerJobs] = caller
    ? await Promise.all([callerJobIds(caller), buyerJobIds(caller)])
    : [new Set<string>(), new Set<string>()];
  if (caller) {
    for (const e of events) {
      if (e.jobId && isParty(e, caller)) callerJobs.add(e.jobId.toLowerCase());
    }
  }
  return c.json({ events: events.map((e) => projectFor(e, caller, callerJobs, buyerJobs)) });
});

eventsRoutes.get('/', async (c) => {
  const caller = readSession(c)?.address?.toLowerCase() ?? null;
  const [callerJobs, buyerJobs] = caller
    ? await Promise.all([seedCallerJobs(caller), buyerJobIds(caller)])
    : [new Set<string>(), new Set<string>()];
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
            data: JSON.stringify(projectFor(e, caller, callerJobs, buyerJobs)),
          });
        }
        await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
      }
    } finally {
      unsub();
    }
  });
});
