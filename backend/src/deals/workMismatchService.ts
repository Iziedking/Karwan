import type { DirectDeal } from '../db/deals.js';
import { liftWorkMismatch, liftedLine, type LiftResult, type WorkCheckLifter } from './workMismatch.js';

/// Applies a lifted work mismatch (view 21): saves it only on the delivery
/// and verdict that were seen, tells both people in the deal chat and logs the
/// event. It moves no money; the buyer's release does that.

export interface WorkMismatchDeps {
  getDeal: (jobId: string) => Promise<DirectDeal | null>;
  /// Saves the patch; refuses when the delivery or the verdict changed meanwhile.
  record: (snapshot: DirectDeal, patch: Partial<DirectDeal>) => Promise<DirectDeal | null>;
  emitLifted: (deal: DirectDeal, by: WorkCheckLifter) => void;
  systemMessage: (jobId: string, eventType: string, body: string) => Promise<unknown>;
  now: () => number;
}

export type ApplyLiftResult = (LiftResult & { ok: false }) | { ok: true; deal: DirectDeal } | { ok: false; code: 'not-found' | 'changed'; message: string };

export async function applyWorkMismatchLift(
  jobId: string,
  input: { by: WorkCheckLifter; reason?: string },
  deps: WorkMismatchDeps,
): Promise<ApplyLiftResult> {
  const deal = await deps.getDeal(jobId);
  if (!deal) return { ok: false, code: 'not-found', message: 'No deal has this id.' };
  const result = liftWorkMismatch(deal, input, deps.now());
  if (!result.ok) return result;
  const saved = await deps.record(deal, result.patch);
  if (!saved) return { ok: false, code: 'changed', message: 'The delivery changed while this was being saved. Open the deal again.' };
  deps.emitLifted(saved, input.by);
  await deps.systemMessage(deal.jobId, 'deal.work.accepted', liftedLine(input.by));
  return { ok: true, deal: saved };
}

export async function liveWorkMismatchDeps(): Promise<WorkMismatchDeps> {
  const [{ getDeal, recordWorkCheckOverride }, { bus }, { addSystemMessage }] = await Promise.all([
    import('../db/deals.js'),
    import('../events.js'),
    import('../chat/systemMessages.js'),
  ]);
  return {
    getDeal,
    record: recordWorkCheckOverride,
    emitLifted: (deal, by) => bus.emitEvent({
      type: 'deal.work.accepted',
      jobId: deal.jobId,
      actor: by === 'buyer' ? 'buyer' : 'platform',
      payload: { buyer: deal.buyer, seller: deal.seller, deliveryRevision: deal.deliveryRevision ?? 0, by },
    }),
    systemMessage: (jobId, eventType, body) =>
      addSystemMessage({ jobId, channel: 'trade', channelKey: jobId, eventType, occurrenceKey: String(Date.now()), body }),
    now: Date.now,
  };
}
