import { createHash } from 'node:crypto';
import type { ResearchAllowanceSnapshot, ResearchAllowanceStore } from './researchAllowance.js';

export class ResearchDeliveryInProgressError extends Error {
  constructor() {
    super('research report delivery is already in progress');
    this.name = 'ResearchDeliveryInProgressError';
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

export function researchResultId(resourceId: string, result: unknown): string {
  return createHash('sha256').update(canonicalJson({ resourceId, result })).digest('hex');
}

export async function deliverComplimentaryResearchReport<TResult>(input: {
  store: ResearchAllowanceStore;
  agentAddress: string;
  requestId: string;
  resourceId: string;
  deliver: () => Promise<TResult>;
  now?: () => number;
}): Promise<{ result: TResult; resultId: string; allowance: ResearchAllowanceSnapshot; reused: boolean }> {
  const reservedAt = input.now?.() ?? Date.now();
  const reserved = await input.store.reserve({
    agentAddress: input.agentAddress,
    requestId: input.requestId,
    resourceId: input.resourceId,
    now: reservedAt,
  });
  if (reserved.reservation.state === 'delivered') {
    if (reserved.reservation.result === undefined || !reserved.reservation.resultId) {
      throw new Error('delivered research reservation is missing its persisted result');
    }
    return {
      result: reserved.reservation.result as TResult,
      resultId: reserved.reservation.resultId,
      allowance: reserved.snapshot,
      reused: true,
    };
  }
  if (!reserved.created) throw new ResearchDeliveryInProgressError();

  let result: TResult;
  try {
    result = await input.deliver();
  } catch (error) {
    await input.store.release({
      reservationId: reserved.reservation.id, leaseToken: reserved.reservation.leaseToken,
      reason: error instanceof Error ? error.message : 'research delivery failed',
      now: input.now?.() ?? Date.now(),
    });
    throw error;
  }

  const resultId = researchResultId(input.resourceId, result);
  const committed = await input.store.commit({
    reservationId: reserved.reservation.id, leaseToken: reserved.reservation.leaseToken,
    resultId,
    result,
    now: input.now?.() ?? Date.now(),
  });
  return { result, resultId, allowance: committed.snapshot, reused: false };
}
