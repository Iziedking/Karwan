import { Hono } from 'hono';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  parseNegotiationOperationTask,
  type NegotiationOperationTaskData,
} from '../negotiation/operationTask.js';
import {
  parseEvidenceAcquisitionOperationTask,
  type EvidenceAcquisitionOperationTaskData,
} from '../evidence/acquisitionTask.js';
import {
  parseEvidenceReconciliationOperationTask,
  type EvidenceReconciliationOperationTaskData,
} from '../evidence/reconciliationTask.js';
import {
  parseFinancialCommandShadowTask,
  type FinancialCommandShadowTaskData,
} from '../agents/financialCommandShadow.js';
import {
  parseFinancialCommandOperationTask,
  type FinancialCommandOperationTaskData,
} from '../financial/operationTask.js';
import {
  stakeQualificationShadowTaskSchema,
  type StakeQualificationShadowTaskData,
} from '../agents/stakeQualificationShadow.js';
import {
  parseConfirmedAgentFundingObservation,
  type ConfirmedAgentFundingObservation,
} from '../agents/stakeFundingResume.js';
import {
  parseStakeFinancialOperationInput,
  parseStakeApprovalResumeInput,
  type StakeApprovalResumeInput,
  type StakeFinancialOperationInput,
} from '../agents/stakeFinancialProjection.js';
import {
  parseBoundedReengagementInput,
  type BoundedReengagementInput,
} from '../negotiation/reengagement.js';

type ReviewedNegotiationObserver = (
  data: NegotiationOperationTaskData,
) => Promise<{ created: boolean }>;
type ReviewedEvidenceObserver = (
  data: EvidenceAcquisitionOperationTaskData,
) => Promise<{ created: boolean }>;
type ReviewedEvidenceReconciliationObserver = (
  data: EvidenceReconciliationOperationTaskData,
) => Promise<{ created: boolean }>;
type FinancialShadowObserver = (
  data: FinancialCommandShadowTaskData,
) => Promise<{ created: boolean }>;
type ReviewedFinancialOperationObserver = (
  data: FinancialCommandOperationTaskData,
) => Promise<{ created: boolean }>;
type StakeQualificationShadowObserver = (
  data: StakeQualificationShadowTaskData,
) => Promise<{ created: boolean }>;
type StakeFundingResumeObserver = (
  data: ConfirmedAgentFundingObservation,
) => Promise<{ created: number }>;
type StakeFinancialOperationObserver = (
  data: StakeFinancialOperationInput,
) => Promise<{ created: boolean }>;
type StakeApprovalResumeObserver = (
  data: StakeApprovalResumeInput,
) => Promise<{ created: boolean; reason?: string }>;
type ReengagementObserver = (
  data: BoundedReengagementInput,
) => Promise<{ decision: { outcome: string }; created: boolean }>;

let reviewedNegotiationObserver: ReviewedNegotiationObserver | null = null;
let reviewedEvidenceObserver: ReviewedEvidenceObserver | null = null;
let reviewedEvidenceReconciliationObserver: ReviewedEvidenceReconciliationObserver | null = null;
let financialShadowObserver: FinancialShadowObserver | null = null;
let reviewedFinancialOperationObserver: ReviewedFinancialOperationObserver | null = null;
let stakeQualificationShadowObserver: StakeQualificationShadowObserver | null = null;
let stakeFundingResumeObserver: StakeFundingResumeObserver | null = null;
let stakeFinancialOperationObserver: StakeFinancialOperationObserver | null = null;
let stakeApprovalResumeObserver: StakeApprovalResumeObserver | null = null;
let reengagementObserver: ReengagementObserver | null = null;

export function configureReviewedNegotiationIngress(
  observer: ReviewedNegotiationObserver,
): () => void {
  reviewedNegotiationObserver = observer;
  return () => {
    if (reviewedNegotiationObserver === observer) reviewedNegotiationObserver = null;
  };
}

export function configureReviewedEvidenceIngress(
  observer: ReviewedEvidenceObserver,
): () => void {
  reviewedEvidenceObserver = observer;
  return () => {
    if (reviewedEvidenceObserver === observer) reviewedEvidenceObserver = null;
  };
}

export function configureReviewedEvidenceReconciliationIngress(
  observer: ReviewedEvidenceReconciliationObserver,
): () => void {
  reviewedEvidenceReconciliationObserver = observer;
  return () => {
    if (reviewedEvidenceReconciliationObserver === observer) reviewedEvidenceReconciliationObserver = null;
  };
}

export function configureFinancialShadowIngress(
  observer: FinancialShadowObserver,
): () => void {
  financialShadowObserver = observer;
  return () => {
    if (financialShadowObserver === observer) financialShadowObserver = null;
  };
}

export function configureReviewedFinancialOperationIngress(
  observer: ReviewedFinancialOperationObserver,
): () => void {
  reviewedFinancialOperationObserver = observer;
  return () => {
    if (reviewedFinancialOperationObserver === observer) reviewedFinancialOperationObserver = null;
  };
}

export function configureStakeQualificationShadowIngress(
  observer: StakeQualificationShadowObserver,
): () => void {
  stakeQualificationShadowObserver = observer;
  return () => {
    if (stakeQualificationShadowObserver === observer) stakeQualificationShadowObserver = null;
  };
}

export function configureStakeFundingResumeIngress(
  observer: StakeFundingResumeObserver,
): () => void {
  stakeFundingResumeObserver = observer;
  return () => {
    if (stakeFundingResumeObserver === observer) stakeFundingResumeObserver = null;
  };
}

export function configureStakeFinancialOperationIngress(
  observer: StakeFinancialOperationObserver,
): () => void {
  stakeFinancialOperationObserver = observer;
  return () => {
    if (stakeFinancialOperationObserver === observer) stakeFinancialOperationObserver = null;
  };
}

export function configureStakeApprovalResumeIngress(
  observer: StakeApprovalResumeObserver,
): () => void {
  stakeApprovalResumeObserver = observer;
  return () => {
    if (stakeApprovalResumeObserver === observer) stakeApprovalResumeObserver = null;
  };
}

export function configureReengagementIngress(
  observer: ReengagementObserver,
): () => void {
  reengagementObserver = observer;
  return () => {
    if (reengagementObserver === observer) reengagementObserver = null;
  };
}

export const reviewedOperationIngressRoutes = new Hono();
reviewedOperationIngressRoutes.use('*', requireAdmin);

/**
 * This is an explicit admin review ingress, separate from read-only runtime
 * reporting. It only enqueues validated reviewed tasks; it cannot directly
 * accept, fund, stake, settle, or call a provider.
 */
reviewedOperationIngressRoutes.post('/negotiation', async (c) => {
  if (!reviewedNegotiationObserver) {
    return c.json({
      error: 'reviewed negotiation ingress is disabled',
      mode: 'reviewed-operation-seam',
      legacyRoutesEnqueue: false,
    }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  let parsed: NegotiationOperationTaskData;
  try {
    parsed = parseNegotiationOperationTask(body);
  } catch (error) {
    return c.json({
      mode: 'reviewed-operation-seam',
      error: 'invalid reviewed negotiation task',
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }, 400);
  }
  try {
    const result = await reviewedNegotiationObserver(parsed);
    return c.json({
      mode: 'reviewed-operation-seam',
      taskKind: 'negotiation.turn.operation',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      ...result,
    }, result.created ? 202 : 200);
  } catch {
    return c.json({
      mode: 'reviewed-operation-seam',
      taskKind: 'negotiation.turn.operation',
      error: 'reviewed negotiation enqueue failed',
    }, 500);
  }
});

/**
 * Explicit admin ingress for one bounded user-triggered re-engagement. The
 * policy runs before durable enqueue; this route cannot publish an offer,
 * call a model/provider, accept terms, or move money.
 */
reviewedOperationIngressRoutes.post('/reengagement', async (c) => {
  if (!reengagementObserver) {
    return c.json({
      error: 'reviewed re-engagement ingress is disabled',
      mode: 'read-only-shadow',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
    }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  let parsed: BoundedReengagementInput;
  try {
    parsed = parseBoundedReengagementInput(body);
  } catch (error) {
    return c.json({
      mode: 'read-only-shadow',
      error: 'invalid reviewed re-engagement task',
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }, 400);
  }
  try {
    const result = await reengagementObserver(parsed);
    return c.json({
      mode: 'read-only-shadow',
      taskKind: 'deal_room.reengage',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
      ...result,
    }, result.created ? 202 : 200);
  } catch {
    return c.json({
      mode: 'read-only-shadow',
      taskKind: 'deal_room.reengage',
      error: 'reviewed re-engagement enqueue failed',
    }, 500);
  }
});

/**
 * Explicit admin review ingress for evidence acquisition. It only enqueues a
 * validated operation; any provider call requires a separately injected
 * adapter and reviewed handler registration.
 */
reviewedOperationIngressRoutes.post('/evidence', async (c) => {
  if (!reviewedEvidenceObserver) {
    return c.json({
      error: 'reviewed evidence ingress is disabled',
      mode: 'reviewed-evidence-operation-seam',
      legacyRoutesEnqueue: false,
      evidenceProviderCallsAuthorized: false,
    }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  let parsed: EvidenceAcquisitionOperationTaskData;
  try {
    parsed = parseEvidenceAcquisitionOperationTask(body);
  } catch (error) {
    return c.json({
      mode: 'reviewed-evidence-operation-seam',
      error: 'invalid reviewed evidence task',
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }, 400);
  }
  try {
    const result = await reviewedEvidenceObserver(parsed);
    return c.json({
      mode: 'reviewed-evidence-operation-seam',
      taskKind: 'evidence.acquisition.operation',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      // The ingress only validates and enqueues a reviewed task. Provider
      // calls remain disabled until a separately constructed handler receives
      // an explicitly injected adapter.
      evidenceProviderCallsAuthorized: false,
      ...result,
    }, result.created ? 202 : 200);
  } catch {
    return c.json({
      mode: 'reviewed-evidence-operation-seam',
      taskKind: 'evidence.acquisition.operation',
      error: 'reviewed evidence enqueue failed',
    }, 500);
  }
});

/**
 * Records a verified provider observation for an already-created evidence
 * purchase. This is deliberately separate from acquisition: it cannot call a
 * provider, sign x402, spend research credit, or resubmit an uncertain pull.
 */
reviewedOperationIngressRoutes.post('/evidence-reconciliation', async (c) => {
  if (!reviewedEvidenceReconciliationObserver) {
    return c.json({
      error: 'reviewed evidence reconciliation ingress is disabled',
      mode: 'reviewed-evidence-reconciliation',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      evidenceProviderCallsAuthorized: false,
      financialMutationsAuthorized: false,
    }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  let parsed: EvidenceReconciliationOperationTaskData;
  try {
    parsed = parseEvidenceReconciliationOperationTask(body);
  } catch (error) {
    return c.json({
      mode: 'reviewed-evidence-reconciliation',
      error: 'invalid reviewed evidence reconciliation observation',
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }, 400);
  }
  try {
    const result = await reviewedEvidenceReconciliationObserver(parsed);
    return c.json({
      mode: 'reviewed-evidence-reconciliation',
      taskKind: 'evidence.reconcile.operation',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      evidenceProviderCallsAuthorized: false,
      financialMutationsAuthorized: false,
      ...result,
    }, result.created ? 202 : 200);
  } catch {
    return c.json({
      mode: 'reviewed-evidence-reconciliation',
      taskKind: 'evidence.reconcile.operation',
      error: 'reviewed evidence reconciliation enqueue failed',
    }, 500);
  }
});

/**
 * Explicit admin ingress for a financial policy observation. This is
 * checkpoint-only shadow work: it records the command decision and optional
 * provider observation, but cannot call Circle or mutate money.
 */
reviewedOperationIngressRoutes.post('/financial-shadow', async (c) => {
  if (!financialShadowObserver) {
    return c.json({
      error: 'financial shadow ingress is disabled',
      mode: 'read-only-shadow',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
    }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  let parsed: FinancialCommandShadowTaskData;
  try {
    parsed = parseFinancialCommandShadowTask(body);
  } catch (error) {
    return c.json({
      mode: 'read-only-shadow',
      error: 'invalid financial shadow task',
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }, 400);
  }
  try {
    const result = await financialShadowObserver(parsed);
    return c.json({
      mode: 'read-only-shadow',
      taskKind: 'financial.command.shadow',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
      ...result,
    }, result.created ? 202 : 200);
  } catch {
    return c.json({
      mode: 'read-only-shadow',
      taskKind: 'financial.command.shadow',
      error: 'financial shadow enqueue failed',
    }, 500);
  }
});

/**
 * Explicit admin ingress for stake qualification. This only enqueues the
 * validated shadow task; it cannot approve, transfer, stake, or resume a
 * live DealRoom.
 */
reviewedOperationIngressRoutes.post('/staking-shadow', async (c) => {
  if (!stakeQualificationShadowObserver) {
    return c.json({
      error: 'stake qualification shadow ingress is disabled',
      mode: 'read-only-shadow',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      stakeExecutionAuthorized: false,
      financialMutationsAuthorized: false,
    }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const parsed = stakeQualificationShadowTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      mode: 'read-only-shadow',
      error: 'invalid stake qualification shadow task',
      detail: parsed.error.message.slice(0, 300),
    }, 400);
  }
  try {
    const result = await stakeQualificationShadowObserver(parsed.data);
    return c.json({
      mode: 'read-only-shadow',
      taskKind: 'stake.qualification.shadow',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      stakeExecutionAuthorized: false,
      financialMutationsAuthorized: false,
      ...result,
    }, result.created ? 202 : 200);
  } catch {
    return c.json({
      mode: 'read-only-shadow',
      taskKind: 'stake.qualification.shadow',
      error: 'stake qualification shadow enqueue failed',
    }, 500);
  }
});

/**
 * Explicit admin ingress for a confirmed funding observation. It only
 * resumes matching qualification blockers through the shadow task store;
 * it cannot transfer funds, stake, approve, or reopen a closed DealRoom.
 */
reviewedOperationIngressRoutes.post('/staking-funding-shadow', async (c) => {
  if (!stakeFundingResumeObserver) {
    return c.json({
      error: 'stake funding resume shadow ingress is disabled',
      mode: 'read-only-shadow',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      stakeExecutionAuthorized: false,
      financialMutationsAuthorized: false,
    }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  let parsed: ConfirmedAgentFundingObservation;
  try {
    parsed = parseConfirmedAgentFundingObservation(body);
  } catch (error) {
    return c.json({
      mode: 'read-only-shadow',
      error: 'invalid stake funding observation',
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }, 400);
  }
  try {
    const result = await stakeFundingResumeObserver(parsed);
    return c.json({
      mode: 'read-only-shadow',
      taskKind: 'stake.qualification.shadow',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      stakeExecutionAuthorized: false,
      financialMutationsAuthorized: false,
      created: result.created > 0,
      resumedTasks: result.created,
    }, result.created > 0 ? 202 : 200);
  } catch {
    return c.json({
      mode: 'read-only-shadow',
      taskKind: 'stake.qualification.shadow',
      error: 'stake funding resume enqueue failed',
    }, 500);
  }
});

/**
 * Explicit admin ingress for one reviewed financial operation. The route only
 * validates and enqueues the already-authorized task shape. Provider execution
 * remains unavailable unless the reviewed-operation worker is constructed with
 * an injected adapter and the explicit rollout flag is enabled.
 */
reviewedOperationIngressRoutes.post('/financial-operation', async (c) => {
  if (!reviewedFinancialOperationObserver) {
    return c.json({
      error: 'reviewed financial operation ingress is disabled',
      mode: 'reviewed-operation-seam',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
    }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  let parsed: FinancialCommandOperationTaskData;
  try {
    parsed = parseFinancialCommandOperationTask(body);
  } catch (error) {
    return c.json({
      mode: 'reviewed-operation-seam',
      error: 'invalid reviewed financial operation task',
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }, 400);
  }
  try {
    const result = await reviewedFinancialOperationObserver(parsed);
    return c.json({
      mode: 'reviewed-operation-seam',
      taskKind: 'financial.command.operation',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
      ...result,
    }, result.created ? 202 : 200);
  } catch {
    return c.json({
      mode: 'reviewed-operation-seam',
      taskKind: 'financial.command.operation',
      error: 'reviewed financial operation enqueue failed',
    }, 500);
  }
});

/**
 * Explicit admin ingress for a policy-approved stake projection. The route
 * converts the exact approval and execution descriptor into the existing
 * reviewed financial task shape. It never calls Circle directly and remains
 * unavailable until the reviewed-operation seam is explicitly configured.
 */
reviewedOperationIngressRoutes.post('/staking-operation', async (c) => {
  if (!stakeFinancialOperationObserver) {
    return c.json({
      error: 'reviewed staking operation ingress is disabled',
      mode: 'reviewed-operation-seam',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
    }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  let parsed: StakeFinancialOperationInput;
  try {
    parsed = parseStakeFinancialOperationInput(body);
  } catch (error) {
    return c.json({
      mode: 'reviewed-operation-seam',
      error: 'invalid reviewed staking operation input',
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error),
    }, 400);
  }
  try {
    const result = await stakeFinancialOperationObserver(parsed);
    return c.json({
      mode: 'reviewed-operation-seam',
      taskKind: 'financial.command.operation',
      operation: 'STAKE',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
      ...result,
    }, result.created ? 202 : 200);
  } catch {
    return c.json({
      mode: 'reviewed-operation-seam',
      taskKind: 'financial.command.operation',
      operation: 'STAKE',
      error: 'reviewed staking operation enqueue failed',
    }, 500);
  }
});

/**
 * Rechecks a persisted approval and enqueues one reviewed stake operation.
 * This route never approves, consumes, or submits the approval; the durable
 * financial executor remains the only consumer of that authority.
 */
reviewedOperationIngressRoutes.post('/staking-operation-resume', async (c) => {
  if (!stakeApprovalResumeObserver) {
    return c.json({
      error: 'reviewed staking approval resume ingress is disabled',
      mode: 'reviewed-operation-seam',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
    }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  let parsed: StakeApprovalResumeInput;
  try {
    parsed = parseStakeApprovalResumeInput(body);
  } catch (error) {
    return c.json({
      mode: 'reviewed-operation-seam',
      error: 'invalid reviewed staking approval resume input',
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error),
    }, 400);
  }
  try {
    const result = await stakeApprovalResumeObserver(parsed);
    return c.json({
      mode: 'reviewed-operation-seam',
      taskKind: 'financial.command.operation',
      operation: 'STAKE',
      legacyRoutesEnqueue: false,
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
      ...result,
    }, result.created ? 202 : result.reason ? 409 : 200);
  } catch {
    return c.json({
      mode: 'reviewed-operation-seam',
      taskKind: 'financial.command.operation',
      operation: 'STAKE',
      error: 'reviewed staking approval resume failed',
    }, 500);
  }
});
