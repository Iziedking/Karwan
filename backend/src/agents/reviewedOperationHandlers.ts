import type { DurableTaskHandler } from './durableTaskRunner.js';
import type { CircleWalletAdapter } from '../circle/CircleWalletAdapter.js';
import {
  createNegotiationOperationHandlers,
  type NegotiationOperationExecutor,
} from '../negotiation/operationTask.js';
import type { NegotiationAttemptStore } from '../negotiation/attempts.js';
import {
  createFinancialCommandOperationHandlers,
} from '../financial/operationTask.js';
import type { FinancialRuntimeRepository } from '../financial/runtime.js';
import type { AgentRuntimeRepository } from '../db/agentRuntime.js';
import {
  createEvidenceAcquisitionOperationHandlers,
  type EvidenceAcquisitionAdapter,
} from '../evidence/acquisitionTask.js';
import {
  createEvidenceReconciliationOperationHandlers,
} from '../evidence/reconciliationTask.js';
import type { EvidenceRuntimeRepository } from '../evidence/runtime.js';
import type { DataBudget } from '../x402/dataGate.js';

export interface ReviewedOperationHandlerOptions {
  negotiationExecutor?: NegotiationOperationExecutor;
  negotiationAttempts?: NegotiationAttemptStore;
  financialRepository?: FinancialRuntimeRepository;
  financialAdapter?: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'>;
  approvalRepository?: Pick<AgentRuntimeRepository, 'getApproval' | 'updateApproval'>;
  evidenceRepository?: EvidenceRuntimeRepository;
  evidenceAdapter?: EvidenceAcquisitionAdapter;
  evidenceReconciliationRepository?: EvidenceRuntimeRepository;
  /** The person's weekly data budget; every paid evidence read goes through it. */
  evidenceBudget?: DataBudget;
}

/**
 * Composes only explicitly supplied reviewed operation handlers. An empty
 * dependency set produces no handlers, which is the safe default at boot;
 * evidence and financial handlers require injected provider adapters.
 */
export function createReviewedOperationTaskHandlers(
  options: ReviewedOperationHandlerOptions,
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    ...(options.negotiationExecutor && options.negotiationAttempts
      ? createNegotiationOperationHandlers({
          executor: options.negotiationExecutor,
          attempts: options.negotiationAttempts,
        })
      : {}),
    ...(options.financialRepository && options.financialAdapter
      ? createFinancialCommandOperationHandlers({
          repository: options.financialRepository,
          adapter: options.financialAdapter,
          ...(options.approvalRepository ? { approvalRepository: options.approvalRepository } : {}),
        })
      : {}),
    ...(options.evidenceRepository && options.evidenceAdapter
      ? createEvidenceAcquisitionOperationHandlers({
          repository: options.evidenceRepository,
          adapter: options.evidenceAdapter,
          ...(options.evidenceBudget ? { budget: options.evidenceBudget } : {}),
        })
      : {}),
    ...(options.evidenceReconciliationRepository
      ? createEvidenceReconciliationOperationHandlers({
          repository: options.evidenceReconciliationRepository,
          ...(options.evidenceBudget ? { budget: options.evidenceBudget } : {}),
        })
      : {}),
  };
}
