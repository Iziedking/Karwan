/// What a notification is about, for its icon and tint. One glance tells money
/// from a decision waiting on you.
export type NotificationKind = 'money' | 'attention' | 'match' | 'done' | 'deal';

const ATTENTION = new Set([
  'deal.direct.declined',
  'deal.direct.edited',
  'deal.disputed',
  'deal.fund.insufficient',
  'deal.deadline.passed',
  'deal.delivery.flagged',
  'deal.cancel.proposed',
  'deal.match.raised',
  'job.expired',
  'factoring.defaulted',
  'po.defaulted',
]);
const DONE = new Set(['deal.seller-approved', 'deal.accepted', 'escrow.settled', 'deal.delivery.cleared', 'reputation.tier-up']);
const MONEY_PREFIXES = ['wallet.', 'vault.', 'agent.funded', 'agent.withdrawal', 'yield.', 'gateway.', 'bridge.', 'escrow.', 'cashout.', 'factoring.', 'po.'];

export function notificationKind(type: string): NotificationKind {
  if (ATTENTION.has(type)) return 'attention';
  if (DONE.has(type)) return 'done';
  if (type.startsWith('deal.match') || type === 'deal.matched' || type === 'listing.matched' || type === 'negotiation.near-miss' || type === 'trend.match' || type === 'agent.declined') return 'match';
  if (MONEY_PREFIXES.some((prefix) => type.startsWith(prefix))) return 'money';
  return 'deal';
}
