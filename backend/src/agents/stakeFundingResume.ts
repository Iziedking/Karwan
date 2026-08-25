import { createHash } from 'node:crypto';
import { formatUnits } from 'viem';
import { z } from 'zod';
import { parseUsdcMicro } from '../matching/money.js';
import type { AgentRuntimeRepository } from '../db/agentRuntime.js';
import type { EvidenceRuntimeRepository, QualificationBlockerRecord } from '../evidence/runtime.js';
import type { DurableTaskStore } from './durableTaskRunner.js';
import {
  createStakeQualificationShadowObserver,
  stakeQualificationShadowTaskSchema,
  type StakeQualificationShadowTaskData,
} from './stakeQualificationShadow.js';

export interface ConfirmedAgentFundingObservation {
  agentAddress: string;
  amountUsdc: string;
  movementState: string;
  observedAtUnix: number;
  reference?: string;
  txHash?: string;
}

const confirmedAgentFundingObservationSchema = z.object({
  agentAddress: z.string().regex(/^0x[0-9a-f]{40}$/i),
  amountUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
  movementState: z.string().min(1),
  observedAtUnix: z.number().int().nonnegative(),
  reference: z.string().min(1).optional(),
  txHash: z.string().regex(/^0x[0-9a-f]{64}$/i).optional(),
}).strict();

export function parseConfirmedAgentFundingObservation(
  input: unknown,
): ConfirmedAgentFundingObservation {
  return confirmedAgentFundingObservationSchema.parse(input);
}

export interface StakeFundingResumeObservation {
  data: StakeQualificationShadowTaskData;
}

export interface StakeFundingResumeResult {
  created: number;
}

export type StakeFundingResumeObserver = (
  observation: ConfirmedAgentFundingObservation,
) => Promise<StakeFundingResumeResult>;

function normalizedAddress(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function fundingFingerprint(
  task: StakeQualificationShadowTaskData,
  observation: ConfirmedAgentFundingObservation,
): string {
  const receiptIdentity = observation.reference ?? observation.txHash ?? String(observation.observedAtUnix);
  return createHash('sha256')
    .update([
      task.dealRoomId,
      task.blocker?.blockerKey ?? 'no-blocker',
      observation.agentAddress.toLowerCase(),
      observation.amountUsdc,
      observation.reference ?? '',
      observation.txHash ?? '',
      receiptIdentity,
    ].join('|'))
    .digest('hex');
}

/**
 * Converts one confirmed, already-recorded agent funding event into the next
 * shadow qualification task. It is pure and intentionally refuses uncertain
 * movement states, a mismatched destination, invalid amounts, or a task that
 * has no persisted blocker.
 */
export function buildStakeFundingResumeObservation(
  task: StakeQualificationShadowTaskData,
  observation: ConfirmedAgentFundingObservation,
): StakeFundingResumeObservation | null {
  const parsed = stakeQualificationShadowTaskSchema.safeParse(task);
  if (!parsed.success || !parsed.data.blocker) return null;
  if (observation.movementState.trim().toLowerCase() !== 'completed') return null;
  const agentAddress = normalizedAddress(observation.agentAddress);
  if (!agentAddress || agentAddress !== parsed.data.requirement.fundingWallet.toLowerCase()) return null;

  let deposited: bigint;
  let priorLiquid: bigint;
  try {
    deposited = parseUsdcMicro(observation.amountUsdc);
    priorLiquid = parseUsdcMicro(parsed.data.snapshot.liquidFundingUsdc);
  } catch {
    return null;
  }
  if (deposited <= 0n) return null;

  const fingerprint = fundingFingerprint(parsed.data, {
    ...observation,
    agentAddress,
  });
  const triggerReference = observation.reference ?? observation.txHash ?? `funding:${fingerprint}`;
  const attemptNumber = (parsed.data.resume?.attemptNumber ?? 1) + 1;
  const next: StakeQualificationShadowTaskData = {
    ...parsed.data,
    idempotencyKey: `${parsed.data.idempotencyKey}:funding:${fingerprint}`,
    observedAtUnix: observation.observedAtUnix,
    source: 'funding-confirmed',
    confirmedFunding: true,
    snapshot: {
      ...parsed.data.snapshot,
      liquidFundingUsdc: formatUnits(priorLiquid + deposited, 6),
    },
    resume: {
      attemptId: `attempt:${parsed.data.dealRoomId}:funds:${fingerprint}`,
      attemptNumber,
      triggerReference,
      strategy: {
        mode: 'resume-prior-history',
        trigger: 'FUNDS_CONFIRMED',
        source: 'agent.funded',
      },
      ...(parsed.data.resume?.priorOfferVersion === undefined
        ? {}
        : { priorOfferVersion: parsed.data.resume.priorOfferVersion }),
    },
  };
  return { data: next };
}

function shadowTaskFromBlocker(blocker: QualificationBlockerRecord): StakeQualificationShadowTaskData | null {
  const candidate = blocker.data.shadowTask;
  const parsed = stakeQualificationShadowTaskSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function isClosedDealRoom(state: string): boolean {
  return state === 'completed' || state === 'cancelled' || state === 'expired';
}

/**
 * Observes an existing `agent.funded` completion and re-enters only matching
 * active stake blockers. A completed, cancelled, or expired DealRoom is never
 * re-entered when a room repository is supplied. Enqueueing is idempotent; the handler later resolves the
 * blocker and creates one FUNDS_CONFIRMED attempt without staking or funding.
 */
export function createStakeFundingResumeObserver(
  taskStore: DurableTaskStore,
  evidenceRepository: EvidenceRuntimeRepository,
  roomRepository?: AgentRuntimeRepository,
): StakeFundingResumeObserver {
  const enqueue = createStakeQualificationShadowObserver(taskStore, roomRepository);
  return async (observation) => {
    const agentAddress = normalizedAddress(observation.agentAddress);
    if (!agentAddress) return { created: 0 };
    let created = 0;
    const blockers = await evidenceRepository.listOpenBlockersForSubject(agentAddress);
    for (const blocker of blockers) {
      const task = shadowTaskFromBlocker(blocker);
      if (!task || task.requirement.fundingWallet !== agentAddress || !task.snapshot.dealRoomOpen) continue;
      if (roomRepository) {
        const room = await roomRepository.getDealRoom(task.dealRoomId);
        if (!room || isClosedDealRoom(room.state)) continue;
      }
      const resumed = buildStakeFundingResumeObservation(task, {
        ...observation,
        agentAddress,
      });
      if (resumed && (await enqueue(resumed)).created) created += 1;
    }
    return { created };
  };
}
