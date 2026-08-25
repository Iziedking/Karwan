export type DealRoomState =
  | 'open'
  | 'qualifying'
  | 'stake_required'
  | 'awaiting_stake_approval'
  | 'awaiting_stake_funding'
  | 'staking'
  | 'qualified'
  | 'negotiating'
  | 'awaiting_user_review'
  | 'temporary_impasse'
  | 'reengagement_scheduled'
  | 'matched'
  | 'funding_ready'
  | 'funding'
  | 'active'
  | 'settling'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type OfferState =
  | 'draft'
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'expired'
  | 'superseded';

export type AgentTaskState =
  | 'pending'
  | 'leased'
  | 'running'
  | 'waiting'
  | 'failed'
  | 'succeeded'
  | 'dead_letter'
  | 'cancelled';

export type ApprovalState =
  | 'requested'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'cancelled'
  | 'executed';

export const DEAL_ROOM_STATES: readonly DealRoomState[] = [
  'open',
  'qualifying',
  'stake_required',
  'awaiting_stake_approval',
  'awaiting_stake_funding',
  'staking',
  'qualified',
  'negotiating',
  'awaiting_user_review',
  'temporary_impasse',
  'reengagement_scheduled',
  'matched',
  'funding_ready',
  'funding',
  'active',
  'settling',
  'completed',
  'cancelled',
  'expired',
] as const;

export const OFFER_STATES: readonly OfferState[] = [
  'draft',
  'proposed',
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
  'superseded',
] as const;

export const AGENT_TASK_STATES: readonly AgentTaskState[] = [
  'pending',
  'leased',
  'running',
  'waiting',
  'failed',
  'succeeded',
  'dead_letter',
  'cancelled',
] as const;

export const APPROVAL_STATES: readonly ApprovalState[] = [
  'requested',
  'approved',
  'denied',
  'expired',
  'cancelled',
  'executed',
] as const;

const dealRoomTransitions: TransitionGraph<DealRoomState> = {
  open: ['qualifying', 'negotiating', 'cancelled', 'expired'],
  qualifying: ['stake_required', 'qualified', 'temporary_impasse', 'cancelled', 'expired'],
  stake_required: [
    'awaiting_stake_approval',
    'awaiting_stake_funding',
    'staking',
    'qualified',
    'cancelled',
    'expired',
  ],
  awaiting_stake_approval: [
    'awaiting_stake_funding',
    'staking',
    'stake_required',
    'cancelled',
    'expired',
  ],
  awaiting_stake_funding: ['staking', 'stake_required', 'cancelled', 'expired'],
  staking: ['qualified', 'stake_required', 'temporary_impasse', 'cancelled', 'expired'],
  qualified: ['negotiating', 'cancelled', 'expired'],
  negotiating: [
    'awaiting_user_review',
    'temporary_impasse',
    'matched',
    'cancelled',
    'expired',
  ],
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
};

const offerTransitions: TransitionGraph<OfferState> = {
  draft: ['proposed', 'withdrawn'],
  proposed: ['accepted', 'rejected', 'withdrawn', 'expired', 'superseded'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
  superseded: [],
};

const agentTaskTransitions: TransitionGraph<AgentTaskState> = {
  pending: ['leased', 'cancelled'],
  leased: ['running', 'pending', 'failed', 'cancelled'],
  running: ['waiting', 'failed', 'succeeded', 'cancelled'],
  waiting: ['pending', 'cancelled'],
  failed: ['pending', 'dead_letter', 'cancelled'],
  succeeded: [],
  dead_letter: [],
  cancelled: [],
};

const approvalTransitions: TransitionGraph<ApprovalState> = {
  requested: ['approved', 'denied', 'expired', 'cancelled'],
  approved: ['executed', 'expired', 'cancelled'],
  denied: [],
  expired: [],
  cancelled: [],
  executed: [],
};

type TransitionGraph<TState extends string> = Readonly<Record<TState, readonly TState[]>>;

export interface VersionedState<TState extends string> {
  state: TState;
  version: number;
  updatedAt: number;
}

function canTransition<TState extends string>(
  graph: TransitionGraph<TState>,
  from: TState,
  to: TState,
): boolean {
  return from === to || graph[from].includes(to);
}

function transition<TState extends string, TRecord extends VersionedState<TState>>(
  label: string,
  graph: TransitionGraph<TState>,
  record: TRecord,
  nextState: TState,
  now: number,
): TRecord {
  if (!canTransition(graph, record.state, nextState)) {
    throw new Error(`invalid ${label} transition ${record.state} -> ${nextState}`);
  }
  if (record.state === nextState) return record;
  return { ...record, state: nextState, version: record.version + 1, updatedAt: now };
}

export function canTransitionDealRoom(from: DealRoomState, to: DealRoomState): boolean {
  return canTransition(dealRoomTransitions, from, to);
}

export function canTransitionOffer(from: OfferState, to: OfferState): boolean {
  return canTransition(offerTransitions, from, to);
}

export function canTransitionAgentTask(from: AgentTaskState, to: AgentTaskState): boolean {
  return canTransition(agentTaskTransitions, from, to);
}

export function canTransitionApproval(from: ApprovalState, to: ApprovalState): boolean {
  return canTransition(approvalTransitions, from, to);
}

export function transitionDealRoom<T extends VersionedState<DealRoomState>>(
  record: T,
  nextState: DealRoomState,
  now = Date.now(),
): T {
  return transition('deal room', dealRoomTransitions, record, nextState, now);
}

export function transitionOffer<T extends VersionedState<OfferState>>(
  record: T,
  nextState: OfferState,
  now = Date.now(),
): T {
  return transition('offer', offerTransitions, record, nextState, now);
}

export function transitionAgentTask<T extends VersionedState<AgentTaskState>>(
  record: T,
  nextState: AgentTaskState,
  now = Date.now(),
): T {
  return transition('agent task', agentTaskTransitions, record, nextState, now);
}

export function transitionApproval<T extends VersionedState<ApprovalState>>(
  record: T,
  nextState: ApprovalState,
  now = Date.now(),
): T {
  return transition('approval', approvalTransitions, record, nextState, now);
}
