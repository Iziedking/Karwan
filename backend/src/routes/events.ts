import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { bus, type KarwanEvent } from '../events.js';
import { readSession } from '../auth/session.js';

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
/// event, or a follow-up on a deal they are already tracked on), else a pulse.
/// `callerJobs` accumulates the caller's deal ids so later follow-up events that
/// don't restate the party (e.g. escrow.settled) still pass as full detail.
function projectFor(
  e: KarwanEvent,
  caller: string | null,
  callerJobs: Set<string>,
): KarwanEvent {
  if (!caller) return pulse(e);
  const party = isParty(e, caller);
  const tracked = !!e.jobId && callerJobs.has(e.jobId.toLowerCase());
  if (party || tracked) {
    if (party && e.jobId) callerJobs.add(e.jobId.toLowerCase());
    return e;
  }
  return pulse(e);
}

/// Seed the caller's deal ids from recent history so a freshly-opened stream
/// already treats follow-up events on the caller's existing deals as full.
function seedCallerJobs(caller: string): Set<string> {
  const set = new Set<string>();
  for (const e of bus.recent(500)) {
    if (e.jobId && isParty(e, caller)) set.add(e.jobId.toLowerCase());
  }
  return set;
}

/// One-shot JSON snapshot of recent events. Caller-aware: full for the caller's
/// own deals, pulse otherwise. Used from curl/jq during testing and to seed
/// per-deal panels (where the caller is a party, so they get full detail).
eventsRoutes.get('/recent', (c) => {
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
  // Party membership for this result set: if the caller is a party to any event
  // of a job, every event of that job is full for them.
  const callerJobs = new Set<string>();
  if (caller) {
    for (const e of events) {
      if (e.jobId && isParty(e, caller)) callerJobs.add(e.jobId.toLowerCase());
    }
  }
  return c.json({ events: events.map((e) => projectFor(e, caller, callerJobs)) });
});

eventsRoutes.get('/', (c) => {
  const caller = readSession(c)?.address?.toLowerCase() ?? null;
  const callerJobs = caller ? seedCallerJobs(caller) : new Set<string>();
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
          // Keep the SSE event name as the real type so the client's per-type
          // listeners fire; only the data is projected (full or pulse).
          await stream.writeSSE({
            id: String(id),
            event: e.type,
            data: JSON.stringify(projectFor(e, caller, callerJobs)),
          });
        }
        await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
      }
    } finally {
      unsub();
    }
  });
});
