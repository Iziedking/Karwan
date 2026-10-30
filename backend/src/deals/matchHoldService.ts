import type { DirectDeal } from '../db/deals.js';
import type { ReviewerRole } from './deliveryReview.js';
import { clearMatchHold, type ClearHoldResult } from './matchHold.js';

/// Applies a person's decision to clear a held match (view 21). The hold moved
/// no money, so clearing it changes only the record: the card goes for both
/// people, one line lands in the deal chat and the event is logged.

export interface MatchHoldDeps {
  getDeal: (jobId: string) => Promise<DirectDeal | null>;
  /// Saves the cleared hold; refuses when the hold changed or was cleared meanwhile.
  record: (snapshot: DirectDeal, patch: Partial<DirectDeal>) => Promise<DirectDeal | null>;
  emitCleared: (deal: DirectDeal, role: ReviewerRole) => void;
  systemMessage: (jobId: string, eventType: string, body: string) => Promise<unknown>;
  now: () => number;
}

export type ApplyClearResult = ClearHoldResult | { ok: false; code: 'not-found' | 'changed'; message: string };

export async function applyMatchHoldClear(
  jobId: string,
  input: { role: ReviewerRole; reason: string },
  deps: MatchHoldDeps,
): Promise<ApplyClearResult> {
  const deal = await deps.getDeal(jobId);
  if (!deal) return { ok: false, code: 'not-found', message: 'No deal has this id.' };
  const result = clearMatchHold(deal, input, deps.now());
  if (!result.ok) return result;
  const saved = await deps.record(deal, { matchRisk: result.matchRisk });
  if (!saved) return { ok: false, code: 'changed', message: 'The hold changed while this was being saved. Open the deal again.' };
  deps.emitCleared(saved, input.role);
  await deps.systemMessage(deal.jobId, 'security.match.cleared', 'Karwan support looked at this match and found nothing to act on.');
  return result;
}

export async function liveMatchHoldDeps(): Promise<MatchHoldDeps> {
  const [{ getDeal, recordMatchHoldClear }, { bus }, { addSystemMessage }] = await Promise.all([
    import('../db/deals.js'),
    import('../events.js'),
    import('../chat/systemMessages.js'),
  ]);
  return {
    getDeal,
    record: recordMatchHoldClear,
    emitCleared: (deal, role) => bus.emitEvent({
      type: 'security.match.cleared',
      jobId: deal.jobId,
      actor: 'platform',
      payload: { buyer: deal.buyer, seller: deal.seller, flags: deal.matchRisk?.flags ?? [], clearedBy: role },
    }),
    systemMessage: (jobId, eventType, body) =>
      addSystemMessage({ jobId, channel: 'trade', channelKey: jobId, eventType, occurrenceKey: String(Date.now()), body }),
    now: Date.now,
  };
}
