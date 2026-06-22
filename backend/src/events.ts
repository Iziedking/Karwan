import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { desc, sql, and, eq, inArray } from 'drizzle-orm';
import { db, pgEnabled } from './db/client.js';
import { eventHistory } from './db/schema.js';

export type KarwanEventType =
  | 'job.posted'
  | 'job.tracked'
  | 'job.expired'
  | 'bid.scored'
  | 'bid.submitted'
  | 'counter.issued'
  | 'counter.received'
  | 'counter.evaluated'
  | 'counter.response.submitted'
  | 'bid.accepted'
  | 'escrow.approved'
  | 'escrow.funded'
  | 'escrow.milestone.released'
  | 'escrow.settled'
  | 'escrow.accepted'
  | 'escrow.released_from_dispute'
  | 'bridge.approving'
  | 'bridge.burning'
  | 'bridge.burned'
  | 'bridge.attested'
  | 'bridge.minted'
  | 'bridge.error'
  | 'reputation.recorded'
  | 'deal.direct.created'
  | 'deal.direct.edited'
  | 'deal.accepted'
  | 'deal.delivered'
  | 'deal.delivery.flagged'
  | 'deal.delivery.cleared'
  | 'deal.matched'
  | 'deal.match.declined'
  | 'deal.match.approved'
  | 'deal.review.started'
  | 'deal.review.heartbeat'
  | 'deal.acceptance.expired'
  | 'deal.invite.created'
  | 'deal.invite.claimed'
  | 'deal.delay.appealed'
  | 'deal.delay.responded'
  | 'deal.delay.auto_released'
  | 'deal.extension.requested'
  | 'deal.extension.approved'
  | 'deal.extension.declined'
  | 'deal.auto_released'
  | 'deal.disputed'
  | 'deal.cancelled'
  | 'deal.cancel.proposed'
  | 'deal.cancel.declined'
  | 'deal.fund.insufficient'
  | 'listing.posted'
  | 'listing.match.proactive'
  | 'listing.matched'
  | 'listing.cancelled'
  | 'listing.expired'
  | 'brief.cancelled'
  | 'chat.message'
  | 'telegram.linked'
  | 'agent.activated'
  | 'agent.funded'
  | 'agent.withdrawal'
  | 'agent.skipped'
  | 'agent.declined'
  | 'agent.error'
  | 'agent.fallback'
  | 'agent.decision'
  | 'negotiation.attempt-ended'
  | 'negotiation.next-candidate'
  | 'negotiation.exhausted'
  | 'negotiation.near-miss'
  | 'negotiation.near-miss.proceeded'
  | 'negotiation.near-miss.declined'
  | 'negotiation.near-miss.skipped'
  | 'market.scanned'
  | 'reputation.tier-up'
  | 'feedback.submitted'
  | 'vault.deposit'
  | 'vault.withdraw.requested'
  | 'vault.withdraw.cancelled'
  | 'vault.claimed'
  | 'vault.cooldown.completed'
  | 'cashout.arc.completed'
  | 'wallet.credited'
  | 'wallet.debited'
  | 'circle.webhook'
  | 'system.error'
  /// Operator reply on a support ticket, routed to the user's Telegram by the
  /// notifier. Kept OFF the public SSE feed (carries private reply text).
  | 'support.reply'
  // SME trade-finance rail.
  | 'trade.document.anchored'
  | 'trade.pod.accepted'
  | 'factoring.offered'
  | 'factoring.accepted'
  | 'factoring.rejected'
  | 'factoring.settled'
  | 'factoring.defaulted'
  | 'po.funded'
  | 'po.released'
  | 'po.repaid'
  | 'po.reclaimed'
  | 'po.defaulted'
  // Verified-business accounts.
  | 'business.registration.submitted'
  | 'business.verified'
  | 'business.rejected';

export interface KarwanEvent {
  type: KarwanEventType;
  jobId?: string;
  actor: 'buyer' | 'seller' | 'platform';
  ts: number;
  payload: Record<string, unknown>;
}

const HISTORY_CAPACITY = 500;
/// Throttle for the lazy re-hydrate (see ensureHydrated). When the bus comes up
/// empty because the boot hydrate hit a down Postgres, the next /activity read
/// reloads from event_history, but a legitimately empty store must not re-query
/// PG on every request.
const REHYDRATE_THROTTLE_MS = 30_000;
const STORE_PATH = resolve(process.cwd(), 'data', 'events.json');
// Debounce window. Bursts of events (one auction can fire 5-10 events back to
// back) collapse to a single fsync.
const PERSIST_DEBOUNCE_MS = 800;

function loadHistory(): KarwanEvent[] {
  /// Postgres is the primary store when DATABASE_URL is set. It survives
  /// container restarts, accidental rm, and corrupt JSON. Disk JSON stays
  /// as the no-DB fallback path. Loading from Postgres uses a sync-bridge
  /// pattern: the boot path is async-tolerant but the bus's history field
  /// is initialized synchronously, so the first load returns empty and a
  /// later async hydration fills it. See hydrateFromPostgres below.
  if (!existsSync(STORE_PATH)) return [];
  try {
    const raw = readFileSync(STORE_PATH, 'utf8');
    const arr = JSON.parse(raw) as KarwanEvent[];
    return Array.isArray(arr) ? arr.slice(-HISTORY_CAPACITY) : [];
  } catch {
    return [];
  }
}

class KarwanBus extends EventEmitter {
  private history: KarwanEvent[] = loadHistory();
  private persistTimer: NodeJS.Timeout | null = null;
  private lastHydrateAttempt = 0;
  private hydrating = false;

  emitEvent(e: Omit<KarwanEvent, 'ts'>) {
    const full: KarwanEvent = { ...e, ts: Date.now() };
    this.history.push(full);
    if (this.history.length > HISTORY_CAPACITY) {
      this.history.shift();
    }
    this.schedulePersist();
    /// Durable persist to Postgres alongside the debounced JSON. Fire-and-
    /// forget, since a transient DB hiccup shouldn't block the bus or kill the
    /// in-memory event. The JSON debounce path is the safety net.
    persistEventToPg(full);
    this.emit('event', full);
  }

  subscribe(handler: (e: KarwanEvent) => void): () => void {
    this.on('event', handler);
    return () => this.off('event', handler);
  }

  recent(limit = 100, jobId?: string): KarwanEvent[] {
    const filtered = jobId ? this.history.filter((e) => e.jobId === jobId) : this.history;
    return filtered.slice(-limit).reverse();
  }

  /// Self-heal a cold ring buffer. The boot hydrate runs once; if Postgres was
  /// unreachable then (e.g. the transfer-cap outage), it returns 0 and never
  /// retries, leaving /activity empty even though event_history still holds the
  /// durable record. Call this before a read: if the buffer is empty it reloads
  /// from Postgres, throttled so a genuinely empty store doesn't re-query on
  /// every request. No-op once the buffer has anything in it.
  async ensureHydrated(): Promise<void> {
    if (this.history.length > 0 || !pgEnabled || this.hydrating) return;
    if (Date.now() - this.lastHydrateAttempt < REHYDRATE_THROTTLE_MS) return;
    this.hydrating = true;
    this.lastHydrateAttempt = Date.now();
    try {
      await this.hydrateFromPg();
    } finally {
      this.hydrating = false;
    }
  }

  /// Seed the ring buffer with historical events without firing live
  /// subscribers. Used by the chain backfill on boot: a fresh deploy lands
  /// with no data/events.json and the activity feed would be empty until live
  /// traffic accumulated. Replaying through `emitEvent` would re-fire
  /// Telegram + SSE for every historical event, so this path bypasses the
  /// EventEmitter and writes straight to the history array.
  ///
  /// Events are inserted in caller-supplied order, merged with the existing
  /// history, deduped by (type|jobId|ts), and sorted ascending by ts before
  /// the slice to capacity. A single persist is scheduled at the end so
  /// hundreds of backfilled events become one fsync.
  injectHistorical(events: KarwanEvent[]): number {
    if (events.length === 0) return 0;
    const seen = new Set<string>(this.history.map((e) => `${e.type}|${e.jobId ?? ''}|${e.ts}`));
    let added = 0;
    for (const e of events) {
      const key = `${e.type}|${e.jobId ?? ''}|${e.ts}`;
      if (seen.has(key)) continue;
      seen.add(key);
      this.history.push(e);
      added += 1;
    }
    this.history.sort((a, b) => a.ts - b.ts);
    if (this.history.length > HISTORY_CAPACITY) {
      this.history = this.history.slice(-HISTORY_CAPACITY);
    }
    if (added > 0) {
      this.schedulePersist();
      /// Bulk-insert into Postgres alongside the JSON debounce. ON CONFLICT
      /// (type, jobId, ts) DO NOTHING handles repeated injections from the
      /// chain backfill / bridge sync without write contention.
      persistEventsBulkToPg(events);
    }
    return added;
  }

  /// Async hydration from Postgres. Called once during boot if PG is
  /// configured; loads the most recent HISTORY_CAPACITY events back into
  /// the in-memory ring buffer so /api/activity and the SSE backfill see
  /// the durable record even after events.json is wiped.
  async hydrateFromPg(): Promise<number> {
    if (!pgEnabled) return 0;
    try {
      const rows = await db()
        .select()
        .from(eventHistory)
        .orderBy(desc(eventHistory.ts))
        .limit(HISTORY_CAPACITY);
      if (rows.length === 0) return 0;
      const events = rows
        .map((r) => r.data as KarwanEvent)
        .sort((a, b) => a.ts - b.ts);
      /// Merge into existing history (which may be seeded from disk JSON)
      /// rather than replacing, so a stale JSON file plus an old-but-valid
      /// PG row don't clobber each other. injectHistorical dedupes by
      /// (type|jobId|ts), so an exact match across the two stores collapses.
      const added = this.injectHistorical(events);
      return added;
    } catch {
      return 0;
    }
  }

  /// Snapshot the current history length. Used by the boot backfill to skip
  /// the chain scan when a persisted snapshot already loaded events from
  /// disk; running the scan again would be wasted RPCs.
  historyLength(): number {
    return this.history.length;
  }

  /// Debounced flush to data/events.json. We accept losing the trailing window
  /// (~1s) of events on a hard crash. Full per-event fsync would be wasteful
  /// since one auction emits ~10 events back to back. Postgres-backed in a
  /// future iteration.
  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        const dir = dirname(STORE_PATH);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(STORE_PATH, JSON.stringify(this.history), 'utf8');
      } catch {
        /* persist failures are non-fatal, history stays in memory */
      }
    }, PERSIST_DEBOUNCE_MS);
  }
}

export const bus = new KarwanBus();
bus.setMaxListeners(0);

/// Count rows durably stored in the event_history table. The backfill uses this
/// to report `durable: N` right after persisting, so the operator can tell at a
/// glance whether the injected events actually landed in Postgres (and will
/// survive a restart) instead of only sitting in the in-memory ring. Returns
/// null when Postgres isn't configured.
/// Read the most recent events of the given types straight from event_history,
/// newest first. The public activity feed uses this so the capped in-memory
/// ring (HISTORY_CAPACITY=500, easily saturated by non-public negotiation and
/// chat noise) can't crowd the sparse public events out of view. Optionally
/// scoped to a single jobId for per-deal timelines. Returns [] when Postgres
/// isn't configured so the caller falls back to the in-memory ring.
export async function recentEventsByType(
  types: string[],
  limit: number,
  jobId?: string,
): Promise<KarwanEvent[]> {
  if (!pgEnabled || types.length === 0) return [];
  try {
    const where = jobId
      ? and(inArray(eventHistory.type, types), eq(eventHistory.jobId, jobId))
      : inArray(eventHistory.type, types);
    const rows = await db()
      .select()
      .from(eventHistory)
      .where(where)
      .orderBy(desc(eventHistory.ts))
      .limit(Math.max(1, Math.min(500, limit)));
    return rows.map((r) => r.data as KarwanEvent);
  } catch {
    return [];
  }
}

export async function eventHistoryCount(): Promise<number | null> {
  if (!pgEnabled) return null;
  try {
    const rows = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(eventHistory);
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null;
  }
}

/// Postgres write paths. Fire-and-forget, so the bus stays usable even if the DB
/// is unreachable; the disk JSON debounce path is the safety net. Returns
/// void so caller `void`s and moves on. Failures are swallowed silently
/// because every per-event log line on a hot path would be noisy; the
/// schedulePersist JSON write covers durability in any case.

function persistEventToPg(e: KarwanEvent): void {
  if (!pgEnabled) return;
  void db()
    .insert(eventHistory)
    .values({
      type: e.type,
      jobId: e.jobId ?? '',
      ts: e.ts,
      data: e,
    })
    .onConflictDoNothing()
    .catch(() => {
      /* swallow, JSON debounce path keeps durability */
    });
}

function persistEventsBulkToPg(events: KarwanEvent[]): void {
  if (!pgEnabled || events.length === 0) return;
  const rows = events.map((e) => ({
    type: e.type,
    jobId: e.jobId ?? '',
    ts: e.ts,
    data: e,
  }));
  void db()
    .insert(eventHistory)
    .values(rows)
    .onConflictDoNothing()
    .catch(() => {
      /* swallow, JSON debounce path keeps durability */
    });
}
