import { EventEmitter } from 'node:events';

export type KarwanEventType =
  | 'job.posted'
  | 'job.tracked'
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
  | 'bridge.burned'
  | 'bridge.attested'
  | 'bridge.minted'
  | 'bridge.error'
  | 'reputation.recorded'
  | 'deal.direct.created'
  | 'deal.accepted'
  | 'deal.delivered'
  | 'deal.matched'
  | 'deal.match.declined'
  | 'deal.match.approved'
  | 'deal.review.started'
  | 'deal.review.heartbeat'
  | 'deal.auto_released'
  | 'deal.disputed'
  | 'deal.cancelled'
  | 'deal.fund.insufficient'
  | 'chat.message'
  | 'telegram.linked'
  | 'agent.activated'
  | 'agent.withdrawal'
  | 'agent.skipped'
  | 'agent.declined'
  | 'agent.error';

export interface KarwanEvent {
  type: KarwanEventType;
  jobId?: string;
  actor: 'buyer' | 'seller' | 'platform';
  ts: number;
  payload: Record<string, unknown>;
}

const HISTORY_CAPACITY = 500;

class KarwanBus extends EventEmitter {
  private history: KarwanEvent[] = [];

  emitEvent(e: Omit<KarwanEvent, 'ts'>) {
    const full: KarwanEvent = { ...e, ts: Date.now() };
    this.history.push(full);
    if (this.history.length > HISTORY_CAPACITY) {
      this.history.shift();
    }
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
}

export const bus = new KarwanBus();
bus.setMaxListeners(0);
