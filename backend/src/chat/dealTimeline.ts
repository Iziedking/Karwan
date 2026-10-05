import { bus } from '../events.js';
import { logger } from '../logger.js';
import { addSystemMessage } from './systemMessages.js';

/// The deal steps both parties see as quiet lines in their deal chat, so the
/// conversation and the record of what happened sit in one place. The app shows
/// each line in the reader's language by event type; this English is the
/// stored fallback. Delivery is posted where it happens, with its proof note.
const LINES: Record<string, string> = {
  'deal.accepted': 'The seller accepted the agreement.',
  'escrow.funded': 'The buyer funded the escrow. The money is held until release.',
  'deal.release.blocked': 'The delivery check paused the payment.',
  'deal.release.unblocked': 'The delivery check cleared. The payment can move.',
  'deal.delivery.cleared': 'The delivery check cleared. The payment can move.',
  'escrow.milestone.released': 'A payment was released to the seller.',
  'deal.milestone.auto_released': 'A payment was released after the review time ended.',
  'escrow.settled': 'The deal is settled.',
  'escrow.refunded': 'The money went back to the buyer.',
  'escrow.reclaimed': 'The money went back to the buyer.',
  'deal.disputed': 'A dispute was opened.',
  'escrow.resolved': 'The dispute was resolved.',
  'deal.dispute.auto_resolved': 'The dispute was closed.',
  'deal.cancel.proposed': 'A cancel was proposed.',
  'deal.cancel.declined': 'The cancel was declined.',
  'deal.cancelled': 'The deal was cancelled.',
  'deal.extension.requested': 'More time was requested.',
  'deal.extension.approved': 'More time was agreed.',
  'deal.direct.edited': 'The terms were updated.',
};

export const TIMELINE_EVENTS = new Set(Object.keys(LINES));

export function timelineLine(eventType: string): string | null {
  return LINES[eventType] ?? null;
}

let registered = false;

/// Posts each deal step into the deal's chat. Idempotent per event: the message
/// id carries the event time, so a replayed event lands on the same message.
export function registerDealTimeline(): void {
  if (registered) return;
  registered = true;
  bus.on('event', (event: { type: string; jobId?: string; ts?: number }) => {
    const body = timelineLine(event.type);
    if (!body || !event.jobId) return;
    const ts = event.ts ?? Date.now();
    addSystemMessage({
      jobId: event.jobId,
      channel: 'trade',
      channelKey: event.jobId,
      eventType: event.type,
      occurrenceKey: String(ts),
      body,
      ts,
    }).catch((err: Error) => logger.warn({ jobId: event.jobId, type: event.type, err: err.message }, 'deal timeline line failed'));
  });
}
