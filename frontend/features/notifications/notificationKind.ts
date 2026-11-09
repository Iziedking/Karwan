/// What a notification is about, for its icon and tint. One glance tells money
/// from a decision waiting on you.
export type NotificationKind = 'money' | 'attention' | 'match' | 'done' | 'deal';

const ATTENTION = new Set([
  'deal.direct.declined',
  'deal.direct.edited',
  'deal.disputed',
  'deal.fund.insufficient',
  'deal.review.ending',
  'deal.deadline.soon',
  'deal.deadline.passed',
  'deal.extension.waiting',
  'deal.delivery.flagged',
  'deal.cancel.proposed',
  'deal.match.raised',
  'job.expired',
  'factoring.defaulted',
  'po.defaulted',
  'agent.budget',
]);
const DONE = new Set(['deal.seller-approved', 'deal.accepted', 'escrow.settled', 'deal.delivery.cleared', 'reputation.tier-up']);
const MONEY_PREFIXES = ['agent.weekly', 'wallet.', 'vault.', 'agent.funded', 'agent.withdrawal', 'yield.', 'gateway.', 'bridge.', 'escrow.', 'cashout.', 'factoring.', 'po.'];

export function notificationKind(type: string): NotificationKind {
  if (ATTENTION.has(type)) return 'attention';
  if (DONE.has(type)) return 'done';
  if (type.startsWith('deal.match') || type === 'deal.matched' || type === 'listing.matched' || type === 'negotiation.near-miss' || type === 'trend.match' || type === 'market.watch' || type === 'agent.suggestion' || type === 'offer.request-changed' || type === 'agent.declined' || type === 'agent.brief' || type === 'agent.note') return 'match';
  if (MONEY_PREFIXES.some((prefix) => type.startsWith(prefix))) return 'money';
  return 'deal';
}

/// The notices addressed to a seller by payload, with no deal on the event: a
/// rising-demand nudge (to the market), "ask me first" (to the request, once
/// per request) and the record reminder. Null for anything else.
export function sellerNudge(type: string, payload: Record<string, unknown> | undefined, ts: number): { id: string; href: string } | null {
  if (type === 'trend.match') return { id: `trend.match-${ts}`, href: '/market' };
  if (type === 'agent.weekly' || type === 'agent.budget' || type === 'agent.research.failed' || type === 'agent.brief') return { id: `${type}-${ts}`, href: '/profile/setup' };
  // A live note is about one request (view 52, step 4).
  if (type === 'agent.note') {
    // A seller's pitch has no request yet; it opens the pitch (view 72).
    const pitchId = typeof payload?.pitchId === 'string' && /^[\w-]{1,80}$/.test(payload.pitchId) ? payload.pitchId : '';
    if (pitchId) return { id: `agent.note-pitch-${pitchId}-${ts}`, href: `/find/pitch/${pitchId}` };
    const jobId = typeof payload?.jobId === 'string' ? payload.jobId : '';
    return { id: `agent.note-${jobId}-${ts}`, href: jobId ? `/jobs/${jobId}` : '/profile/setup' };
  }
  if (type === 'market.watch') return { id: `market.watch-${String(payload?.watchId ?? '')}-${ts}`, href: '/market' };
  if (type === 'agent.suggestion') {
    const jobId = typeof payload?.jobId === 'string' ? payload.jobId : '';
    return jobId ? { id: `agent.suggestion-${jobId}`, href: `/jobs/${jobId}` } : null;
  }
  if (type === 'offer.request-changed') {
    const jobId = typeof payload?.jobId === 'string' ? payload.jobId : '';
    return jobId ? { id: `offer.request-changed-${jobId}-${ts}`, href: `/jobs/${jobId}` } : null;
  }
  if (type === 'agent.question.decided') {
    const jobId = typeof payload?.jobId === 'string' ? payload.jobId : '';
    return jobId ? { id: `agent.question.decided-${jobId}`, href: `/jobs/${jobId}` } : null;
  }
  // The record reminder: to the deal it is about, or to the assistant, which sets the record up.
  if (type === 'record.setup_needed') {
    const jobId = typeof payload?.jobId === 'string' ? payload.jobId : '';
    return jobId ? { id: `record.setup_needed-${jobId}`, href: `/deals/${jobId}` } : { id: `record.setup_needed-${ts}`, href: '/assistant' };
  }
  return null;
}
