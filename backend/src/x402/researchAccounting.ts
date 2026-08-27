import { bus } from '../events.js';
import { recordResearchPayment, type ResearchPaymentRecord } from '../db/researchPayments.js';
import type { ResearchPaymentNotice, ResearchFailureNotice } from './externalClient.js';

export async function recordExternalResearchPayment(args: {
  notice: ResearchPaymentNotice;
  actor: 'buyer' | 'seller' | 'platform';
  agent: string;
  jobId?: string;
  owner?: string;
  scope?: string;
}): Promise<ResearchPaymentRecord> {
  const { notice } = args;
  const row = await recordResearchPayment({
    idempotencyKey: `${notice.runId}:${notice.angle}`,
    runId: notice.runId,
    ...(args.jobId ? { jobId: args.jobId } : {}),
    ...(args.owner ? { owner: args.owner } : {}),
    actor: args.actor,
    angle: notice.angle,
    provider: notice.provider,
    amountUsd: notice.amountUsd,
    ...(notice.payer ? { payer: notice.payer } : {}),
    ...(notice.txHash ? { txHash: notice.txHash } : {}),
    paidAt: notice.paidAt,
  });
  bus.emitEvent({
    type: 'agent.paid',
    ...(args.jobId ? { jobId: args.jobId } : {}),
    actor: args.actor,
    payload: {
      rail: 'base',
      kind: 'research',
      agent: args.agent,
      ...(args.scope ? { scope: args.scope } : {}),
      provider: notice.provider,
      angle: notice.angle,
      runId: notice.runId,
      paymentId: row.idempotencyKey,
      accounting: row.storage,
      status: 'settled',
      amountUsd: row.amountUsd,
      ...(row.txHash ? { txHash: row.txHash } : {}),
      ...(row.payer ? { payer: row.payer } : {}),
      ...(args.owner ? { user: args.owner } : {}),
      synthesis: 'pending',
    },
  });
  return row;
}

export function recordExternalResearchFailure(args: {
  notice: ResearchFailureNotice;
  actor: 'buyer' | 'seller' | 'platform';
  agent: string;
  jobId?: string;
  scope?: string;
}): void {
  const { notice } = args;
  if (notice.paidUsd <= 0) return;
  bus.emitEvent({
    type: 'agent.research.failed',
    ...(args.jobId ? { jobId: args.jobId } : {}),
    actor: args.actor,
    payload: {
      kind: 'research',
      agent: args.agent,
      ...(args.scope ? { scope: args.scope } : {}),
      runId: notice.runId,
      amountUsd: notice.paidUsd,
      paymentCount: notice.paymentCount,
      reason: notice.reason,
      status: 'paid_synthesis_failed',
    },
  });
}
