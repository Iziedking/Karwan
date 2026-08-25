import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_TASK_STATES,
  APPROVAL_STATES,
  DEAL_ROOM_STATES,
  OFFER_STATES,
  canTransitionAgentTask,
  canTransitionApproval,
  canTransitionDealRoom,
  canTransitionOffer,
  transitionAgentTask,
  transitionApproval,
  transitionDealRoom,
  transitionOffer,
  type AgentTaskState,
  type ApprovalState,
  type DealRoomState,
  type OfferState,
} from './agentRuntimeState.js';
import { canTransitionMovement, type MoneyMovementState } from '../money/model.js';

function assertMatrix<TState extends string>(input: {
  label: string;
  states: readonly TState[];
  allowed: Readonly<Record<TState, readonly TState[]>>;
  canTransition: (from: TState, to: TState) => boolean;
}): void {
  for (const from of input.states) {
    for (const to of input.states) {
      const expected = from === to || input.allowed[from].includes(to);
      assert.equal(
        input.canTransition(from, to),
        expected,
        `${input.label}: ${from} -> ${to}`,
      );
    }
  }
}

test('DealRoom transition matrix is exhaustive', () => {
  assertMatrix<DealRoomState>({
    label: 'deal room',
    states: DEAL_ROOM_STATES,
    canTransition: canTransitionDealRoom,
    allowed: {
      open: ['qualifying', 'negotiating', 'cancelled', 'expired'],
      qualifying: ['stake_required', 'qualified', 'temporary_impasse', 'cancelled', 'expired'],
      stake_required: ['awaiting_stake_approval', 'awaiting_stake_funding', 'staking', 'qualified', 'cancelled', 'expired'],
      awaiting_stake_approval: ['awaiting_stake_funding', 'staking', 'stake_required', 'cancelled', 'expired'],
      awaiting_stake_funding: ['staking', 'stake_required', 'cancelled', 'expired'],
      staking: ['qualified', 'stake_required', 'temporary_impasse', 'cancelled', 'expired'],
      qualified: ['negotiating', 'cancelled', 'expired'],
      negotiating: ['awaiting_user_review', 'temporary_impasse', 'matched', 'cancelled', 'expired'],
      awaiting_user_review: ['negotiating', 'temporary_impasse', 'matched', 'cancelled', 'expired'],
      temporary_impasse: ['reengagement_scheduled', 'qualifying', 'negotiating', 'cancelled', 'expired'],
      reengagement_scheduled: ['qualifying', 'negotiating', 'cancelled', 'expired'],
      matched: ['funding_ready', 'cancelled'],
      funding_ready: ['funding', 'cancelled'],
      funding: ['active', 'cancelled'],
      active: ['settling', 'cancelled'],
      settling: ['completed'],
      completed: [],
      cancelled: [],
      expired: [],
    },
  });
});

test('offer transition matrix is exhaustive', () => {
  assertMatrix<OfferState>({
    label: 'offer',
    states: OFFER_STATES,
    canTransition: canTransitionOffer,
    allowed: {
      draft: ['proposed', 'withdrawn'],
      proposed: ['accepted', 'rejected', 'withdrawn', 'expired', 'superseded'],
      accepted: [],
      rejected: [],
      withdrawn: [],
      expired: [],
      superseded: [],
    },
  });
});

test('agent task transition matrix is exhaustive', () => {
  assertMatrix<AgentTaskState>({
    label: 'agent task',
    states: AGENT_TASK_STATES,
    canTransition: canTransitionAgentTask,
    allowed: {
      pending: ['leased', 'cancelled'],
      leased: ['running', 'pending', 'failed', 'cancelled'],
      running: ['waiting', 'failed', 'succeeded', 'cancelled'],
      waiting: ['pending', 'cancelled'],
      failed: ['pending', 'dead_letter', 'cancelled'],
      succeeded: [],
      dead_letter: [],
      cancelled: [],
    },
  });
});

test('approval transition matrix is exhaustive', () => {
  assertMatrix<ApprovalState>({
    label: 'approval',
    states: APPROVAL_STATES,
    canTransition: canTransitionApproval,
    allowed: {
      requested: ['approved', 'denied', 'expired', 'cancelled'],
      approved: ['executed', 'expired', 'cancelled'],
      denied: [],
      expired: [],
      cancelled: [],
      executed: [],
    },
  });
});

test('MoneyMovement transition matrix remains exhaustive', () => {
  const states: readonly MoneyMovementState[] = [
    'created',
    'preparing',
    'submitted',
    'verifying',
    'completed',
    'needs_attention',
    'cancelled',
  ];
  assertMatrix<MoneyMovementState>({
    label: 'money movement',
    states,
    canTransition: canTransitionMovement,
    allowed: {
      created: ['preparing', 'needs_attention', 'cancelled'],
      preparing: ['submitted', 'verifying', 'needs_attention', 'cancelled'],
      submitted: ['preparing', 'verifying', 'needs_attention'],
      verifying: ['preparing', 'submitted', 'completed', 'needs_attention'],
      completed: [],
      needs_attention: ['preparing', 'cancelled'],
      cancelled: [],
    },
  });
});

test('transition helpers advance once and reject forbidden movement', () => {
  const base = { state: 'open' as const, version: 4, updatedAt: 100, id: 'room-1' };
  const next = transitionDealRoom(base, 'qualifying', 200);
  assert.deepEqual(next, { ...base, state: 'qualifying', version: 5, updatedAt: 200 });
  assert.equal(transitionDealRoom(next, 'qualifying', 300), next);
  assert.throws(() => transitionDealRoom(next, 'completed'), /invalid deal room transition/);

  assert.equal(transitionOffer({ state: 'draft', version: 1, updatedAt: 1 }, 'proposed', 2).version, 2);
  assert.equal(transitionAgentTask({ state: 'pending', version: 1, updatedAt: 1 }, 'leased', 2).version, 2);
  assert.equal(transitionApproval({ state: 'requested', version: 1, updatedAt: 1 }, 'approved', 2).version, 2);
});
