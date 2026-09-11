import { config } from '../config.js';
import { listAllDeals, patchDeal, type DirectDeal } from '../db/deals.js';
import {
  bindCreEvidenceReceipt,
  type CreEvidenceReceiptBinding,
} from './creDeliveryRequest.js';
import {
  adoptLegacyCreDeliveryRequest,
  completeCreDeliveryRequest,
} from './creDeliveryRequestQueue.js';
import {
  readEvidenceReceipt,
  type EvidenceReceiptView,
} from '../chain/evidenceReceipt.js';
import { logger } from '../logger.js';

const BINDABLE_STATES = new Set<EvidenceReceiptView['state']>([
  'pass',
  'mismatch',
  'unavailable',
]);

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Convert the public chain view into the exact binding accepted by the queue.
 * Missing fields or non-terminal states stay unbound. In particular, a chain
 * read error and an unrecorded receipt must never complete a delivery lease.
 */
export function receiptBindingFromView(view: EvidenceReceiptView, boundAtMs = Date.now()): CreEvidenceReceiptBinding | null {
  if (!BINDABLE_STATES.has(view.state)) return null;
  if (
    view.termsVersion === undefined
    || view.evidenceRevision === undefined
    || view.expiresAt === undefined
    || view.evidenceCommitment === undefined
    || view.verdictCommitment === undefined
    || view.reportId === undefined
  ) {
    return null;
  }
  const decisionCode = view.state === 'pass' ? 1 : view.state === 'mismatch' ? 2 : 3;
  return {
    termsVersion: view.termsVersion,
    evidenceRevision: view.evidenceRevision,
    expiresAt: view.expiresAt,
    decisionCode,
    evidenceCommitment: view.evidenceCommitment,
    verdictCommitment: view.verdictCommitment,
    reportId: view.reportId,
    boundAt: boundAtMs,
  };
}

function eligible(deal: DirectDeal): boolean {
  return Boolean(
    config.KARWAN_EVIDENCE_REGISTRY_ADDR
    && deal.delivered
    && deal.evidenceRequired
    && !deal.cancelledAt
    && !deal.settledAt
    && deal.creDeliveryRequest,
  );
}

/**
 * Reconcile receipts written by CRE back into Karwan's durable queue. This is
 * deliberately separate from the release watcher: a chain receipt is only
 * useful after the queue lease has been proven to be the one that produced it.
 */
export async function reconcileCreEvidenceReceipts(nowMs = Date.now()): Promise<number> {
  if (!config.KARWAN_EVIDENCE_REGISTRY_ADDR) return 0;
  let completed = 0;
  for (const deal of await listAllDeals()) {
    if (!eligible(deal) || !deal.creDeliveryRequest) continue;
    const request = deal.creDeliveryRequest;
    const view = await readEvidenceReceipt(deal.jobId, deal.agreementVersion ?? 1, {
      evidenceRevision: request.evidenceRevision,
      requireBinding: false,
    });
    const binding = receiptBindingFromView(view, nowMs);
    if (!binding) continue;

    const validation = bindCreEvidenceReceipt(deal, binding, Math.floor(nowMs / 1_000));
    if (!validation.ok) {
      if (validation.code !== 'RECEIPT_CONFLICT') {
        logger.warn({ jobId: deal.jobId, code: validation.code }, 'CRE receipt reconciliation rejected');
      }
      continue;
    }

    const adopted = await adoptLegacyCreDeliveryRequest(request, nowMs);
    if (!adopted.ok) continue;
    const finished = await completeCreDeliveryRequest(adopted.value, validation.binding, nowMs);
    if (!finished.ok) {
      // A pending request has not yet been claimed by CRE. It becomes eligible
      // on the next tick after the workflow claims it; do not claim it here.
      if (!['REQUEST_NOT_CLAIMED', 'REQUEST_EXPIRED', 'REQUEST_LEASE_MISMATCH'].includes(finished.code)) {
        logger.warn({ jobId: deal.jobId, code: finished.code }, 'CRE receipt queue completion failed');
      }
      continue;
    }
    if (!validation.idempotent) {
      const saved = await patchDeal(deal.jobId, {
        creEvidenceReceipt: validation.binding,
        evidenceExpectedCommitment: validation.binding.evidenceCommitment,
      });
      if (!saved) continue;
    }
    completed += finished.idempotent ? 0 : 1;
  }
  return completed;
}

export function startCreEvidenceReconciler(): () => void {
  if (timer) return stopCreEvidenceReconciler;
  const intervalMs = config.CRE_EVIDENCE_RECONCILER_INTERVAL_MS;
  void reconcileCreEvidenceReceipts().catch((err: unknown) => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'CRE receipt reconciliation failed');
  });
  timer = setInterval(() => {
    if (running) return;
    running = true;
    void reconcileCreEvidenceReceipts()
      .catch((err: unknown) => {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'CRE receipt reconciliation failed');
      })
      .finally(() => { running = false; });
  }, intervalMs);
  logger.info({ intervalMs }, 'CRE receipt reconciler started');
  return stopCreEvidenceReconciler;
}

export function stopCreEvidenceReconciler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
}
