import type { ChainEvent } from '@/core/api';

/**
 * Activity rows can represent either a pre-agreement job or a contract-backed
 * deal. Once an agreement exists, the deal detail route is the source of
 * truth. Keeping this decision in one pure mapper prevents new event types
 * from accidentally opening the job loader and getting stuck in a retry loop.
 */
function isDealLifecycleEvent(type: string): boolean {
  if (type.startsWith('escrow.')) return true;
  if (type === 'cashout.arc.completed') return true;

  // Match events describe the auction before an agreement exists. Other deal
  // events are emitted by the direct/contract-backed lifecycle.
  if (type.startsWith('deal.')) return !type.startsWith('deal.match') && type !== 'deal.matched';

  return false;
}

export function hrefForEvent(
  event: Pick<ChainEvent, 'jobId' | 'type'>,
): string | null {
  if (!event.jobId) return null;
  const resource = isDealLifecycleEvent(event.type) ? 'deals' : 'jobs';
  return `/${resource}/${event.jobId}`;
}
