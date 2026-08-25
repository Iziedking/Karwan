import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { InMemoryEvidenceRuntimeRepository } from '../evidence/runtime.js';
import { InMemoryNegotiationAttemptStore } from '../negotiation/attempts.js';
import {
  DurableTaskRunner,
  InMemoryDurableTaskStore,
} from './durableTaskRunner.js';
import {
  createStakeQualificationShadowHandlers,
  createStakeQualificationShadowObserver,
  type StakeQualificationShadowTaskData,
} from './stakeQualificationShadow.js';
import {
  buildStakeFundingResumeObservation,
  createStakeFundingResumeObserver,
} from './stakeFundingResume.js';

const STAKE_OWNER = '0x1111111111111111111111111111111111111111';
const VAULT = '0x2222222222222222222222222222222222222222';
const FUNDING_WALLET = '0x3333333333333333333333333333333333333333';

function task(overrides: Partial<StakeQualificationShadowTaskData> = {}): StakeQualificationShadowTaskData {
  return {
    dealRoomId: 'room-stake-resume',
    idempotencyKey: 'stake:room-stake-resume:funding:v1',
    observedAtUnix: 100,
    source: 'matching-shadow',
    requirement: {
      requirementVersion: 1,
      requiredStakeUsdc: '100',
      stakeOwner: STAKE_OWNER,
      fundingWallet: FUNDING_WALLET,
      vaultAddress: VAULT,
      asset: 'USDC',
      network: 'arc-testnet',
    },
    snapshot: {
      freeStakeUsdc: '25',
      liquidFundingUsdc: '10',
      dealRoomOpen: true,
      mandateVersion: 1,
      expectedRequirementVersion: 1,
    },
    policy: {
      autonomousMaxUsdc: '0',
      allowedVaults: [VAULT],
      allowedNetworks: ['arc-testnet'],
      allowedAssets: ['USDC'],
    },
    blocker: {
      id: 'blocker-stake-resume',
      blockerKey: 'stake:room-stake-resume:seller:requirement:1',
      kind: 'STAKE_SHORTFALL',
      subject: FUNDING_WALLET,
      data: { mode: 'read-only-shadow' },
    },
    confirmedFunding: false,
    ...overrides,
  };
}

const confirmed = {
  agentAddress: FUNDING_WALLET,
  amountUsdc: '15.250000',
  movementState: 'completed',
  observedAtUnix: 200,
  reference: 'kwn-funding-1',
  txHash: '0x' + 'aa'.repeat(32),
};

test('confirmed funding resumes the exact blocker with accumulated liquid funds', () => {
  const original = task();
  const result = buildStakeFundingResumeObservation(original, confirmed);
  assert.ok(result);
  assert.equal(result.data.source, 'funding-confirmed');
  assert.equal(result.data.confirmedFunding, true);
  assert.equal(result.data.snapshot.liquidFundingUsdc, '25.25');
  assert.equal(result.data.resume?.attemptNumber, 2);
  assert.equal(result.data.resume?.triggerReference, 'kwn-funding-1');
  assert.match(result.data.idempotencyKey, /^stake:room-stake-resume:funding:v1:funding:[a-f0-9]{64}$/);
  const replay = buildStakeFundingResumeObservation(original, { ...confirmed, observedAtUnix: 999 });
  assert.equal(replay?.data.idempotencyKey, result.data.idempotencyKey);
  assert.deepEqual(original.snapshot, task().snapshot);
  assert.equal(original.confirmedFunding, false);
});

test('uncertain, mismatched, invalid, or zero funding never resumes a blocker', () => {
  const original = task();
  assert.equal(buildStakeFundingResumeObservation(original, { ...confirmed, movementState: 'submitted' }), null);
  assert.equal(buildStakeFundingResumeObservation(original, { ...confirmed, agentAddress: STAKE_OWNER }), null);
  assert.equal(buildStakeFundingResumeObservation(original, { ...confirmed, amountUsdc: 'not-usdc' }), null);
  assert.equal(buildStakeFundingResumeObservation(original, { ...confirmed, amountUsdc: '0' }), null);
  assert.equal(buildStakeFundingResumeObservation(original, { ...confirmed, agentAddress: 'not-an-address' }), null);
  assert.equal(buildStakeFundingResumeObservation(task({ blocker: undefined }), confirmed), null);
});

test('the observer enqueues once, resolves the open blocker, and records one resume attempt', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const evidence = new InMemoryEvidenceRuntimeRepository();
  const rooms = new InMemoryAgentRuntimeRepository();
  const attempts = new InMemoryNegotiationAttemptStore();
  await rooms.createDealRoom({ id: 'room-stake-resume', jobId: 'room-stake-resume', data: {}, now: 100 });

  const observeTask = createStakeQualificationShadowObserver(tasks, rooms);
  const initial = task();
  await observeTask({ data: initial });
  const first = new DurableTaskRunner(
    tasks,
    createStakeQualificationShadowHandlers(evidence, { clock: () => 110 }),
    { workerId: 'stake-initial', clock: () => 110 },
  );
  assert.equal((await first.runOnce(110)).succeeded, 1);
  assert.equal((await evidence.getBlocker('blocker-stake-resume'))?.state, 'open');

  const resume = createStakeFundingResumeObserver(tasks, evidence, rooms);
  await resume(confirmed);
  await resume(confirmed);
  const second = new DurableTaskRunner(
    tasks,
    createStakeQualificationShadowHandlers(evidence, { attemptStore: attempts, clock: () => 220 }),
    { workerId: 'stake-resume', clock: () => 220 },
  );
  assert.equal((await second.runOnce(220)).succeeded, 1);
  assert.equal((await evidence.getBlocker('blocker-stake-resume'))?.state, 'resolved');
  const resumed = await attempts.list('room-stake-resume');
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0]?.trigger, 'FUNDS_CONFIRMED');
  assert.equal(resumed[0]?.triggerReference, 'kwn-funding-1');
});

test('a closed DealRoom prevents a funding event from re-entering negotiation', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const evidence = new InMemoryEvidenceRuntimeRepository();
  const rooms = new InMemoryAgentRuntimeRepository();
  await rooms.createDealRoom({ id: 'room-stake-resume', jobId: 'room-stake-resume', data: {}, now: 100 });
  const observeTask = createStakeQualificationShadowObserver(tasks, rooms);
  await observeTask({ data: task() });
  const first = new DurableTaskRunner(
    tasks,
    createStakeQualificationShadowHandlers(evidence, { clock: () => 110 }),
    { workerId: 'stake-initial-closed', clock: () => 110 },
  );
  await first.runOnce(110);
  const room = await rooms.getDealRoom('room-stake-resume');
  assert.ok(room);
  await rooms.updateDealRoom(room.id, room.version, 'cancelled', {}, 120);

  const resume = createStakeFundingResumeObserver(tasks, evidence, rooms);
  await resume(confirmed);
  const due = await tasks.claimDue({ workerId: 'closed-room-worker', now: 200, leaseMs: 1_000, limit: 10 });
  assert.equal(due.length, 0);
  assert.equal((await evidence.getBlocker('blocker-stake-resume'))?.state, 'open');
});
