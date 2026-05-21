import type { ChainEvent } from '@/core/api';

export type EventGroup = 'jobs' | 'negotiation' | 'settlement' | 'bridge';
export type ActorFilter = 'buyer' | 'seller' | 'system';

const GROUP_BY_TYPE: Record<string, EventGroup> = {
  'job.posted':                 'jobs',
  'job.tracked':                'jobs',
  'bid.submitted':              'negotiation',
  'bid.scored':                 'negotiation',
  'counter.issued':             'negotiation',
  'counter.response.submitted': 'negotiation',
  'bid.accepted':               'negotiation',
  'agent.skipped':              'negotiation',
  'agent.declined':             'negotiation',
  'agent.fallback':             'negotiation',
  'market.scanned':             'negotiation',
  'escrow.approved':            'settlement',
  'escrow.funded':              'settlement',
  'escrow.milestone.released':  'settlement',
  'escrow.settled':             'settlement',
  'bridge.burned':              'bridge',
  'bridge.attested':            'bridge',
  'bridge.minted':              'bridge',
  'bridge.error':               'bridge',
  'reputation.recorded':        'settlement',
  'deal.direct.created':        'jobs',
  'deal.accepted':              'negotiation',
  'deal.delivered':             'negotiation',
  'deal.review.started':        'settlement',
  'deal.review.heartbeat':      'settlement',
  'deal.auto_released':         'settlement',
  'deal.disputed':              'settlement',
  'deal.cancelled':             'settlement',
  'agent.error':                'jobs', // errors stay visible; group as jobs for counting
};

export function groupOf(type: string): EventGroup {
  return GROUP_BY_TYPE[type] ?? 'jobs';
}

export interface GroupCounts {
  jobs: number;
  negotiation: number;
  settlement: number;
  bridge: number;
}

export function countByGroup(events: ChainEvent[]): GroupCounts {
  const out: GroupCounts = { jobs: 0, negotiation: 0, settlement: 0, bridge: 0 };
  for (const e of events) {
    out[groupOf(e.type)] += 1;
  }
  return out;
}

export interface ActivityFilters {
  groups: Set<EventGroup>;
  actors: Set<ActorFilter>;
  jobIdSearch: string;
}

export function applyFilters(events: ChainEvent[], filters: ActivityFilters): ChainEvent[] {
  const groupActive = filters.groups.size > 0;
  const actorActive = filters.actors.size > 0;
  const search = filters.jobIdSearch.trim().toLowerCase();
  if (!groupActive && !actorActive && !search) return events;
  return events.filter((e) => {
    if (groupActive && !filters.groups.has(groupOf(e.type))) return false;
    if (actorActive && !filters.actors.has(e.actor as ActorFilter)) return false;
    if (search && (!e.jobId || !e.jobId.toLowerCase().includes(search))) return false;
    return true;
  });
}

export const GROUP_LABELS: Record<EventGroup, string> = {
  jobs:        'Jobs',
  negotiation: 'Negotiation',
  settlement:  'Settlement',
  bridge:      'Bridge',
};

export const ACTOR_LABELS: Record<ActorFilter, string> = {
  buyer:  'Buyer',
  seller: 'Seller',
  system: 'System',
};
