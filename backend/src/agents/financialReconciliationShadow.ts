import { z } from 'zod';
import type { RuntimeData } from '../db/agentRuntime.js';
import type { DurableTaskHandler, DurableTaskStore } from './durableTaskRunner.js';
import type { FinancialRuntimeRepository } from '../financial/runtime.js';
import type { ProviderLifecycle } from '../financial/commandBoundary.js';

export const FINANCIAL_RECONCILIATION_SHADOW_TASK = 'financial.reconcile.shadow';

const lifecycleSchema = z.enum(['SUBMITTED', 'UNKNOWN', 'RECONCILING', 'SETTLED', 'FAILED'] satisfies [ProviderLifecycle, ...ProviderLifecycle[]]);
const taskSchema = z.object({
  idempotencyKey: z.string().min(1), providerId: z.string().min(1), lifecycle: lifecycleSchema,
  txHash: z.string().min(1).optional(), failureCode: z.string().min(1).optional(), observedAtUnix: z.number().int().nonnegative(),
}).strict();

export type FinancialReconciliationShadowTaskData = z.infer<typeof taskSchema>;
export interface FinancialReconciliationShadowObservation { data: FinancialReconciliationShadowTaskData }
export type FinancialReconciliationShadowObserver = (observation: FinancialReconciliationShadowObservation) => Promise<void>;

type CircleWebhookPayload = Readonly<Record<string, unknown>>;

function nestedValue(root: unknown, paths: readonly string[]): unknown {
  let current: unknown = root;
  for (const path of paths) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as CircleWebhookPayload)[path];
  }
  return current;
}

function firstString(root: unknown, paths: readonly (readonly string[])[]): string | undefined {
  for (const path of paths) {
    const value = nestedValue(root, path);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Convert a verified Circle webhook notification into a reconciliation
 * observation. The webhook is an external observation only: this helper does
 * not infer an idempotency key from a provider ID, so unrelated notifications
 * are safely ignored instead of being attached to the wrong command.
 */
export function parseCircleReconciliationObservation(
  notification: unknown,
  observedAtUnix: number,
): FinancialReconciliationShadowTaskData | null {
  if (!notification || typeof notification !== 'object') return null;
  const providerId = firstString(notification, [
    ['id'], ['transactionId'], ['transaction', 'id'], ['transaction', 'transactionId'],
  ]);
  const idempotencyKey = firstString(notification, [
    ['idempotencyKey'], ['idempotency_key'], ['transaction', 'idempotencyKey'],
    ['transaction', 'idempotency_key'], ['metadata', 'idempotencyKey'], ['metadata', 'idempotency_key'],
    ['transaction', 'metadata', 'idempotencyKey'], ['transaction', 'metadata', 'idempotency_key'],
  ]);
  if (!providerId || !idempotencyKey) return null;

  const rawStatus = firstString(notification, [
    ['state'], ['status'], ['transaction', 'state'], ['transaction', 'status'],
  ])?.toUpperCase();
  const txHash = firstString(notification, [
    ['txHash'], ['transactionHash'], ['transaction', 'txHash'], ['transaction', 'transactionHash'],
  ]);
  let lifecycle: ProviderLifecycle;
  if (rawStatus === 'COMPLETE' || rawStatus === 'SETTLED' || rawStatus === 'CONFIRMED') {
    lifecycle = txHash ? 'SETTLED' : 'RECONCILING';
  } else if (rawStatus === 'FAILED' || rawStatus === 'CANCELLED' || rawStatus === 'DENIED') {
    lifecycle = 'FAILED';
  } else if (rawStatus === 'UNKNOWN' || rawStatus === 'STUCK') {
    lifecycle = 'RECONCILING';
  } else {
    lifecycle = 'SUBMITTED';
  }
  return {
    idempotencyKey,
    providerId,
    lifecycle,
    ...(lifecycle === 'SETTLED' && txHash ? { txHash } : {}),
    ...(lifecycle === 'FAILED' && rawStatus ? { failureCode: rawStatus } : {}),
    observedAtUnix,
  };
}

function errorText(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 300); }

export function createFinancialReconciliationShadowObserver(taskStore: DurableTaskStore): FinancialReconciliationShadowObserver {
  return async ({ data }) => {
    const parsed = taskSchema.parse(data);
    await taskStore.enqueue({
      id: `task:financial:reconcile:${parsed.idempotencyKey}:${parsed.providerId}`,
      kind: FINANCIAL_RECONCILIATION_SHADOW_TASK,
      idempotencyKey: `reconcile:${parsed.idempotencyKey}:${parsed.providerId}`,
      availableAt: parsed.observedAtUnix,
      maxAttempts: 8,
      data: parsed as unknown as RuntimeData,
      now: parsed.observedAtUnix,
    });
  };
}

export function createFinancialReconciliationShadowHandlers(
  repository: FinancialRuntimeRepository,
  options: { clock?: () => number } = {},
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [FINANCIAL_RECONCILIATION_SHADOW_TASK]: async (context) => {
      const now = options.clock?.() ?? Date.now();
      try {
        const input = taskSchema.parse(context.task.data);
        const current = await repository.get(input.idempotencyKey);
        if (!current) throw new Error('COMMAND_NOT_FOUND');
        if (current.providerId && current.providerId !== input.providerId) throw new Error('PROVIDER_ID_CHANGED');
        const updated = await repository.recordProviderUpdate(
          input.idempotencyKey,
          current.version,
          {
            lifecycle: input.lifecycle,
            providerId: input.providerId,
            ...(input.txHash ? { txHash: input.txHash } : {}),
            ...(input.failureCode ? { failureCode: input.failureCode } : {}),
          },
          input.observedAtUnix,
        );
        await context.checkpoint({
          checkpointKey: 'shadow-reconciliation', phase: 'external.reconciled',
          data: {
            mode: 'read-only-shadow', idempotencyKey: updated.idempotencyKey, providerId: updated.providerId,
            providerLifecycle: updated.providerLifecycle, ...(updated.txHash ? { txHash: updated.txHash } : {}),
            providerCallMade: false, financialMutation: false, processedAtUnix: now,
          },
        });
      } catch (error) {
        await context.checkpoint({
          checkpointKey: 'shadow-reconciliation', phase: 'external.reconciled',
          data: {
            mode: 'read-only-shadow', decision: 'rejected', reason: 'FINANCIAL_RECONCILIATION_INVALID', error: errorText(error),
            providerCallMade: false, financialMutation: false, processedAtUnix: now,
          },
        });
      }
      return { state: 'succeeded' };
    },
  };
}
