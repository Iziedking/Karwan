import type { BuyerJob, ChainEvent } from '@/core/api';

export function makeBuyerJob(overrides: Partial<BuyerJob> = {}): BuyerJob {
  return {
    jobId: 'job-1',
    buyer: '0xbuyer',
    budgetUsdc: '100',
    deadlineUnix: 2_000,
    termsHash: 'terms-hash',
    finalized: false,
    escrowFunded: false,
    bids: [],
    lastCounterPriceBySeller: {},
    counterRoundsBySeller: {},
    ...overrides,
  };
}

export function makeJobEvent(
  type: string,
  payload: Record<string, unknown> = {},
  ts = 100,
): ChainEvent {
  return {
    eventId: `${type}-${ts}`,
    type,
    jobId: 'job-1',
    actor: 'platform',
    ts,
    payload,
  };
}
