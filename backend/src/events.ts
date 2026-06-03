import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
  | 'system.error';

export interface KarwanEvent {
  type: KarwanEventType;
  jobId?: string;
  actor: 'buyer' | 'seller' | 'platform';
  ts: number;
  payload: Record<string, unknown>;
}

const HISTORY_CAPACITY = 500;
const STORE_PATH = resolve(process.cwd(), 'data', 'events.json');
// Debounce window. Bursts of events (one auction can fire 5-10 events back to
// back) collapse to a single fsync.
const PERSIST_DEBOUNCE_MS = 800;

function loadHistory(): KarwanEvent[] {
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

  emitEvent(e: Omit<KarwanEvent, 'ts'>) {
    const full: KarwanEvent = { ...e, ts: Date.now() };
    this.history.push(full);
    if (this.history.length > HISTORY_CAPACITY) {
      this.history.shift();
    }
    this.schedulePersist();
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
    if (added > 0) this.schedulePersist();
    return added;
  }

  /// Snapshot the current history length. Used by the boot backfill to skip
  /// the chain scan when a persisted snapshot already loaded events from
  /// disk; running the scan again would be wasted RPCs.
  historyLength(): number {
    return this.history.length;
  }

  /// Debounced flush to data/events.json. We accept losing the trailing window
  /// (~1s) of events on a hard crash — full per-event fsync would be wasteful
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
        /* persist failures are non-fatal — history stays in memory */
      }
    }, PERSIST_DEBOUNCE_MS);
  }
}

export const bus = new KarwanBus();
bus.setMaxListeners(0);
