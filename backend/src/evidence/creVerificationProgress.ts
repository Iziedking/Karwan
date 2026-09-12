import type { EvidenceReceiptView } from '../chain/evidenceReceipt.js';
import { classifyCreDeliveryRequestForQueue, creDeliveryRequestKey, type DealForRequest } from './creDeliveryRequest.js';
import { readCreQueueProgress, type CreQueueProgress } from './creDeliveryRequestQueue.js';

export type CreVerificationState = 'awaitingDelivery' | 'awaitingRequest' | 'queued' | 'checking' | 'confirming' | 'pass' | 'mismatch' | 'unavailable';
export interface CreVerificationProgress { state: CreVerificationState }

/** Presentation only. Release authority remains the current, bound chain receipt. */
export async function readCreVerificationProgress(
  deal: DealForRequest,
  receipt: EvidenceReceiptView | undefined,
  readQueue: (key: string) => Promise<CreQueueProgress | null> = readCreQueueProgress,
  nowMs = Date.now(),
): Promise<CreVerificationProgress | undefined> {
  if (!deal.evidenceRequired) return undefined;
  if (!deal.delivered) return { state: 'awaitingDelivery' };
  if (receipt?.state === 'pass' || receipt?.state === 'mismatch') return { state: receipt.state };
  if (receipt && receipt.state !== 'not-recorded') return { state: 'unavailable' };
  if (deal.cancelledAt || deal.settledAt) return { state: 'unavailable' };
  const request = classifyCreDeliveryRequestForQueue(deal, Math.floor(nowMs / 1000));
  if (request.kind === 'absent') return { state: deal.creAutoPublication?.error ? 'unavailable' : 'awaitingRequest' };
  if (request.kind !== 'current') return { state: 'unavailable' };
  try {
    const queue = await readQueue(creDeliveryRequestKey(request.request));
    if (!queue) return { state: 'awaitingRequest' };
    if (!Number.isFinite(queue.expiresAt) || queue.expiresAt <= nowMs / 1000) return { state: 'unavailable' };
    if (queue.state === 'pending') return { state: 'queued' };
    if (queue.state === 'leased') {
      if (!Number.isFinite(queue.leaseExpiresAt)) return { state: 'unavailable' };
      return { state: queue.leaseExpiresAt! > nowMs ? 'checking' : 'queued' };
    }
    if (queue.state === 'completed') return { state: 'confirming' };
    return { state: 'unavailable' };
  } catch {
    return { state: 'unavailable' };
  }
}
