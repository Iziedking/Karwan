import {
  decideReengagement,
  type ReengagementDecision,
  type ReengagementInput,
} from './structuredOffer.js';
import { z } from 'zod';
import {
  DEAL_ROOM_REENGAGEMENT_TASK,
  scheduleReengagement,
  type DurableTaskHandler,
  type DurableTask,
  type DurableTaskStore,
} from '../agents/durableTaskRunner.js';
import type { RuntimeData } from '../db/agentRuntime.js';

export interface BoundedReengagementInput extends ReengagementInput {
  dealRoomId: string;
  data?: RuntimeData;
  sourceEventId?: string;
}

const passedOfferReengagementSourceSchema = z.object({
  jobId: z.string().min(1),
  passedAt: z.number().int().nonnegative(),
  passed: z.object({
    buyerAgent: z.string().regex(/^0x[0-9a-f]{40}$/i),
    sellerAgent: z.string().regex(/^0x[0-9a-f]{40}$/i),
    proceedPriceUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
    limitUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
    buyerCeilingUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
    sellerFloorUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
  }).strict(),
}).strict();

export type PassedOfferReengagementSource = z.infer<typeof passedOfferReengagementSourceSchema>;

const boundedReengagementInputSchema = z.object({
  dealRoomId: z.string().min(1),
  trigger: z.enum([
    'NEW_OFFER', 'TERMS_CHANGED', 'MANDATE_CHANGED', 'STAKE_CONFIRMED',
    'FUNDS_CONFIRMED', 'EVIDENCE_IMPROVED', 'CAPACITY_AVAILABLE',
    'COOLDOWN_ELAPSED', 'DEADLINE_WINDOW', 'USER_REQUESTED',
  ]),
  triggerReference: z.string().min(1),
  nowUnix: z.number().int().nonnegative(),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  cooldownUntilUnix: z.number().int().nonnegative().optional(),
  currentFingerprint: z.string().min(1),
  previousFingerprint: z.string().min(1).optional(),
  explicitDoNotReengage: z.boolean().optional(),
  negotiationSpendUsdc: z.string().regex(/^\d+(?:\.\d+)?$/).optional(),
  negotiationSpendCapUsdc: z.string().regex(/^\d+(?:\.\d+)?$/).optional(),
  nextAttemptCostUsdc: z.string().regex(/^\d+(?:\.\d+)?$/).optional(),
  data: z.record(z.unknown()).optional(),
  sourceEventId: z.string().min(1).optional(),
}).strict();

export function parseBoundedReengagementInput(input: unknown): BoundedReengagementInput {
  return boundedReengagementInputSchema.parse(input) as BoundedReengagementInput;
}

/**
 * Projects the existing, user-approved near-miss reconsideration into the
 * bounded shadow scheduler. The legacy route still owns re-raising the offer;
 * this projection only records a user-triggered re-entry opportunity when the
 * optional observer is configured. A single attempt is allowed because the
 * legacy snapshot has no durable V2 attempt counter yet.
 */
export function buildUserRequestedReengagementInput(
  source: {
    jobId: string;
    passedAt: number;
    passed: {
      buyerAgent: string;
      sellerAgent: string;
      proceedPriceUsdc: string;
      limitUsdc: string;
      buyerCeilingUsdc: string;
      sellerFloorUsdc: string;
    };
  },
  nowUnix: number,
): BoundedReengagementInput | null {
  if (!Number.isSafeInteger(nowUnix) || nowUnix < 0) return null;
  const parsed = passedOfferReengagementSourceSchema.safeParse({
    jobId: source.jobId,
    passedAt: source.passedAt,
    passed: source.passed,
  });
  if (!parsed.success) return null;
  const { jobId, passedAt, passed } = parsed.data;
  const fingerprint = [
    'legacy-passed-offer',
    jobId.toLowerCase(),
    passedAt,
    passed.buyerAgent.toLowerCase(),
    passed.sellerAgent.toLowerCase(),
    passed.proceedPriceUsdc,
    passed.limitUsdc,
    passed.buyerCeilingUsdc,
    passed.sellerFloorUsdc,
  ].join(':');
  const triggerReference = `reconsider:${jobId.toLowerCase()}:${passedAt}`;
  return {
    dealRoomId: jobId,
    trigger: 'USER_REQUESTED',
    triggerReference,
    nowUnix,
    attemptCount: 0,
    maxAttempts: 1,
    currentFingerprint: fingerprint,
    previousFingerprint: fingerprint,
    sourceEventId: `legacy-reconsider:${jobId.toLowerCase()}:${passedAt}`,
    data: {
      mode: 'legacy-reconsider',
      buyerAgent: passed.buyerAgent.toLowerCase(),
      sellerAgent: passed.sellerAgent.toLowerCase(),
      proceedPriceUsdc: passed.proceedPriceUsdc,
      buyerCeilingUsdc: passed.buyerCeilingUsdc,
      sellerFloorUsdc: passed.sellerFloorUsdc,
    },
  };
}

export type BoundedReengagementResult =
  | { decision: Extract<ReengagementDecision, { outcome: 'suppress' }>; created: false }
  | { decision: Extract<ReengagementDecision, { outcome: 'schedule' }>; task: DurableTask; created: boolean };

const reengagementTaskSchema = z.object({
  trigger: z.enum([
    'terms_changed', 'mandate_changed', 'evidence_confirmed', 'capacity_changed',
    'deadline_changed', 'funding_confirmed', 'stake_confirmed', 'user_requested',
  ]),
  attemptNumber: z.number().int().positive(),
  triggerReference: z.string().min(1),
  currentFingerprint: z.string().min(1),
  nextAttemptCostUsdc: z.string().min(1).optional(),
}).passthrough();

/** Shadow-only handler for a durable re-entry task. It records the policy
 * checkpoint and deliberately has no negotiation, provider, or money adapter.
 */
export function createReengagementShadowHandlers(): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [DEAL_ROOM_REENGAGEMENT_TASK]: async (context) => {
      const input = reengagementTaskSchema.parse(context.task.data);
      await context.checkpoint({
        checkpointKey: 'reengagement-policy',
        phase: 'task.completed',
        data: {
          mode: 'shadow-reengagement',
          trigger: input.trigger,
          attemptNumber: input.attemptNumber,
          triggerReference: input.triggerReference,
          currentFingerprint: input.currentFingerprint,
          reentryCondition: 'material_trigger',
          providerCallMade: false,
          financialMutation: false,
        },
      });
      return { state: 'succeeded' };
    },
  };
}

/**
 * Applies the deterministic re-engagement policy before creating a durable
 * task. Suppressed triggers never reach the task store, so an automatic path
 * cannot bypass attempt, cooldown, material-change, withdrawal, or spend
 * controls by constructing a task directly.
 */
export async function scheduleBoundedReengagement(
  store: DurableTaskStore,
  input: BoundedReengagementInput,
): Promise<BoundedReengagementResult> {
  const decision = decideReengagement(input);
  if (decision.outcome === 'suppress') {
    return { decision, created: false };
  }
  const scheduled = await scheduleReengagement(store, {
    dealRoomId: input.dealRoomId,
    triggerKey: decision.key,
    trigger: toDurableTrigger(input.trigger),
    ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
    attemptNumber: input.attemptCount + 1,
    now: input.nowUnix * 1_000,
    ...(input.cooldownUntilUnix === undefined ? {} : { cooldownUntil: input.cooldownUntilUnix * 1_000 }),
    data: {
      ...(input.data ?? {}),
      triggerReference: input.triggerReference,
      currentFingerprint: input.currentFingerprint,
      ...(input.nextAttemptCostUsdc === undefined ? {} : { nextAttemptCostUsdc: input.nextAttemptCostUsdc }),
    },
  });
  return { decision, ...scheduled };
}

function toDurableTrigger(trigger: ReengagementInput['trigger']):
  'terms_changed' | 'mandate_changed' | 'evidence_confirmed' | 'capacity_changed'
  | 'deadline_changed' | 'funding_confirmed' | 'stake_confirmed' | 'user_requested' {
  switch (trigger) {
    case 'TERMS_CHANGED': return 'terms_changed';
    case 'MANDATE_CHANGED': return 'mandate_changed';
    case 'EVIDENCE_IMPROVED': return 'evidence_confirmed';
    case 'CAPACITY_AVAILABLE': return 'capacity_changed';
    case 'DEADLINE_WINDOW': return 'deadline_changed';
    case 'FUNDS_CONFIRMED': return 'funding_confirmed';
    case 'STAKE_CONFIRMED': return 'stake_confirmed';
    case 'USER_REQUESTED': return 'user_requested';
    case 'NEW_OFFER':
    case 'COOLDOWN_ELAPSED':
      throw new Error(`trigger ${trigger} is not a material durable trigger`);
  }
}
