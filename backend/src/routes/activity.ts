import { Hono } from 'hono';
import { bus, type KarwanEvent } from '../events.js';

export const activityRoutes = new Hono();

// Payload keys that identify a party. When the caller query is set, an event
// is only included if one of these keys on its payload matches the caller.
// jobId-scoped events (e.g. follow-up escrow.* events on a deal you opened)
// are included via the trackedJobIds pass.
const PARTY_KEYS = ['buyer', 'seller', 'sellerUser', 'buyerUser', 'postedBy'] as const;

function isParty(event: KarwanEvent, caller: string): boolean {
  const payload = event.payload as Record<string, unknown> | undefined;
  if (!payload) return false;
  for (const k of PARTY_KEYS) {
    const v = payload[k];
    if (typeof v === 'string' && v.toLowerCase() === caller) return true;
  }
  return false;
}

/// Returns events filtered to the caller when ?caller= is set, otherwise the
/// global stream. The caller-filtered shape powers /activity for the connected
/// wallet. The unfiltered shape powers the landing-page tickers (HeroFlow,
/// LivePulseStrip, StatsTicker) — sanitizing that public feed is a separate
/// task; for now it still leaks addresses.
activityRoutes.get('/', (c) => {
  const limitParam = c.req.query('limit');
  const jobId = c.req.query('jobId') ?? undefined;
  const callerRaw = c.req.query('caller');
  const caller = callerRaw && /^0x[a-fA-F0-9]{40}$/.test(callerRaw) ? callerRaw.toLowerCase() : null;
  const limit = limitParam ? Math.min(500, Math.max(1, Number(limitParam))) : 100;

  // First pass: respect the existing jobId filter (used by per-deal timelines).
  const base = bus.recent(500, jobId);

  if (!caller) {
    return c.json({ events: base.slice(0, limit) });
  }

  // Two-pass filter so we don't drop follow-up events that lack party fields
  // in their payload but belong to a job the caller is a party to. Pass 1
  // collects jobIds where the caller is named in a party field; pass 2 keeps
  // every event whose jobId is in that set OR whose payload names the caller.
  const callerJobIds = new Set<string>();
  for (const e of base) {
    if (isParty(e, caller) && e.jobId) callerJobIds.add(e.jobId.toLowerCase());
  }
  const events = base.filter((e) => {
    if (isParty(e, caller)) return true;
    if (e.jobId && callerJobIds.has(e.jobId.toLowerCase())) return true;
    return false;
  });

  return c.json({ events: events.slice(0, limit) });
});
