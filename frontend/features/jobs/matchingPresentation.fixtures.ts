import type { ChainEvent, MatchProposal } from '@/core/api';
import type {
  MatchingPresentation,
  MatchingPresentationInput,
  MatchingPresentationState,
} from './matchingPresentation';

const BUYER = `0x${'11'.repeat(20)}`;
const SELLER = `0x${'22'.repeat(20)}`;
const PROPOSED_AT = 1_770_000_000_000;

function proposal(fields: Partial<MatchProposal> = {}): MatchProposal {
  return {
    jobId: `0x${'aa'.repeat(32)}`,
    buyerUser: BUYER,
    buyerAgent: `0x${'33'.repeat(20)}`,
    sellerUser: SELLER,
    sellerAgent: `0x${'44'.repeat(20)}`,
    agreedPriceUsdc: '100',
    deadlineUnix: 1_800_000_000,
    termsHash: `0x${'bb'.repeat(32)}`,
    proposedAt: PROPOSED_AT,
    awaitingParty: 'seller',
    ...fields,
  };
}

function event(
  type: string,
  ts: number,
  payload: Record<string, unknown> = {},
  actor: ChainEvent['actor'] = 'platform',
): ChainEvent {
  return { type, ts, payload, actor };
}

export interface MatchingPresentationFixture {
  name: string;
  state: MatchingPresentationState;
  input: MatchingPresentationInput;
  expected: MatchingPresentation;
}

export const matchingPresentationFixtures: readonly MatchingPresentationFixture[] = [
  {
    name: 'agents reviewing a newly posted request',
    state: 'reviewing',
    input: { events: [event('job.posted', 100)] },
    expected: expected('reviewing', {
      nextActor: 'agents',
      sourceEventType: 'job.posted',
    }),
  },
  {
    name: 'buyer sees a match waiting on the seller',
    state: 'match_ready',
    input: { proposal: proposal(), viewerAddress: BUYER },
    expected: expected('match_ready', {
      tone: 'positive',
      nextActor: 'seller',
      sourceEventType: 'proposal.pending',
      currentOffer: { amountUsdc: '100', revision: 'initial', updatedAt: PROPOSED_AT },
    }),
  },
  {
    name: 'seller sees the same match as their review action',
    state: 'awaiting_user_review',
    input: { proposal: proposal(), viewerAddress: SELLER },
    expected: expected('awaiting_user_review', {
      tone: 'attention',
      nextActor: 'seller',
      viewerMustAct: true,
      action: 'review_match',
      sourceEventType: 'proposal.pending',
      currentOffer: { amountUsdc: '100', revision: 'initial', updatedAt: PROPOSED_AT },
    }),
  },
  {
    name: 'buyer reviews changed terms',
    state: 'terms_changed',
    input: {
      proposal: proposal({
        awaitingParty: 'buyer',
        raisedPriceUsdc: '115',
        raisedAt: PROPOSED_AT + 5_000,
      }),
      viewerAddress: BUYER,
    },
    expected: expected('terms_changed', {
      tone: 'attention',
      nextActor: 'buyer',
      viewerMustAct: true,
      action: 'review_terms',
      sourceEventType: 'proposal.raised',
      currentOffer: { amountUsdc: '115', revision: 'changed', updatedAt: PROPOSED_AT + 5_000 },
    }),
  },
  {
    name: 'buyer funding shortfall pauses a pending match',
    state: 'paused_needs_approval',
    input: { proposal: proposal({ fundable: false }), viewerAddress: BUYER },
    expected: expected('paused_needs_approval', {
      tone: 'attention',
      nextActor: 'buyer',
      viewerMustAct: true,
      action: 'add_funds',
      reason: 'buyer-funding-shortfall',
      sourceEventType: 'proposal.funding',
      currentOffer: { amountUsdc: '100', revision: 'initial', updatedAt: PROPOSED_AT },
    }),
  },
  {
    name: 'trusted match reserve shortfall stays recoverable',
    state: 'paused_needs_approval',
    input: {
      viewerRole: 'seller',
      events: [
        event('agent.skipped', 200, {
          reason: 'insufficient-stake-trusted-match',
          requiredReservationUsdc: '50',
          freeStakeUsdc: '20',
        }),
      ],
    },
    expected: expected('paused_needs_approval', {
      tone: 'attention',
      nextActor: 'seller',
      viewerMustAct: true,
      action: 'review_reserve',
      reason: 'insufficient-stake-trusted-match',
      sourceEventType: 'agent.skipped',
    }),
  },
  {
    name: 'request reopens for materially new bids',
    state: 'reengagement_scheduled',
    input: {
      events: [
        event('negotiation.exhausted', 200),
        event('negotiation.reopened', 300, { reason: 'near-miss-passed' }),
      ],
    },
    expected: expected('reengagement_scheduled', {
      nextActor: 'agents',
      sourceEventType: 'negotiation.reopened',
    }),
  },
  {
    name: 'accepted terms wait for confirmed funding',
    state: 'funding_ready',
    input: { events: [event('bid.accepted', 400, { agreedPriceUsdc: '100' }, 'buyer')] },
    expected: expected('funding_ready', {
      tone: 'positive',
      nextActor: 'platform',
      sourceEventType: 'bid.accepted',
      currentOffer: { amountUsdc: '100', revision: 'unknown', updatedAt: 400 },
    }),
  },
  {
    name: 'durable opening offer waits on the receiving seller',
    state: 'match_ready',
    input: {
      events: [{
        ...event('negotiation.offer.published', 450, { offerId: 'offer-1', offerVersion: 1 }, 'buyer'),
        structuredOffer: { id: 'offer-1', version: 1, amountUsdc: '125', updatedAt: 450 },
      }],
      viewerRole: 'seller',
    },
    expected: expected('match_ready', {
      tone: 'positive',
      nextActor: 'seller',
      viewerMustAct: true,
      action: 'review_match',
      sourceEventType: 'negotiation.offer.published',
      currentOffer: { amountUsdc: '125', revision: 'initial', updatedAt: 450 },
    }),
  },
  {
    name: 'durable counter offer asks the buyer to review changed terms',
    state: 'terms_changed',
    input: {
      events: [{
        ...event('negotiation.offer.published', 460, { offerId: 'offer-2', offerVersion: 2 }, 'seller'),
        structuredOffer: { id: 'offer-2', version: 2, amountUsdc: '130', updatedAt: 460 },
      }],
      viewerRole: 'buyer',
    },
    expected: expected('terms_changed', {
      tone: 'attention',
      nextActor: 'buyer',
      viewerMustAct: true,
      action: 'review_terms',
      sourceEventType: 'negotiation.offer.published',
      currentOffer: { amountUsdc: '130', revision: 'changed', updatedAt: 460 },
    }),
  },
  {
    name: 'durable accepted offer waits for confirmed funding',
    state: 'funding_ready',
    input: {
      events: [{
        ...event('negotiation.offer.accepted', 470, { offerId: 'offer-2', offerVersion: 2 }),
        structuredOffer: { id: 'offer-2', version: 2, amountUsdc: '130', updatedAt: 460 },
      }],
    },
    expected: expected('funding_ready', {
      tone: 'positive',
      nextActor: 'platform',
      sourceEventType: 'negotiation.offer.accepted',
      currentOffer: { amountUsdc: '130', revision: 'changed', updatedAt: 460 },
    }),
  },
  {
    name: 'funded escrow is settling through the deal lifecycle',
    state: 'settling',
    input: { events: [event('escrow.funded', 500, { amountUsdc: '100' }, 'buyer')] },
    expected: expected('settling', {
      tone: 'positive',
      nextActor: 'platform',
      sourceEventType: 'escrow.funded',
    }),
  },
  {
    name: 'settled escrow is the only completed state',
    state: 'completed',
    input: {
      proposal: proposal(),
      viewerAddress: SELLER,
      events: [event('escrow.settled', 600)],
    },
    expected: expected('completed', {
      tone: 'positive',
      live: false,
      terminal: true,
      recoverable: false,
      nextActor: 'none',
      sourceEventType: 'escrow.settled',
      currentOffer: { amountUsdc: '100', revision: 'initial', updatedAt: PROPOSED_AT },
    }),
  },
  {
    name: 'exhausted candidate pass is not a false terminal',
    state: 'temporarily_unavailable',
    input: { viewerRole: 'buyer', events: [event('negotiation.exhausted', 700)] },
    expected: expected('temporarily_unavailable', {
      tone: 'critical',
      live: false,
      nextActor: 'buyer',
      viewerMustAct: true,
      action: 'review_request',
      reason: 'candidates-exhausted',
      sourceEventType: 'negotiation.exhausted',
    }),
  },
  {
    name: 'unknown future event degrades to status updating',
    state: 'status_updating',
    input: { events: [event('agent.future-state', 800)] },
    expected: expected('status_updating', {
      nextActor: 'platform',
      action: 'retry_status',
      reason: 'unrecognized-state',
      sourceEventType: 'agent.future-state',
    }),
  },
];

/** Durable agent-runtime observations characterized separately from the
 * legacy proposal fixtures. These are still presentation-only inputs: none
 * of the fixtures implies that a provider, wallet, or financial command ran.
 */
export const agentRuntimePresentationFixtures: readonly MatchingPresentationFixture[] = [
  {
    name: 'durable qualification blocker asks the seller to review reserve',
    state: 'paused_needs_approval',
    input: {
      viewerRole: 'seller',
      events: [event('qualification.blocked', 900, { reason: 'STAKE_SHORTFALL', approverRole: 'seller' })],
    },
    expected: expected('paused_needs_approval', {
      tone: 'attention',
      nextActor: 'seller',
      viewerMustAct: true,
      action: 'review_reserve',
      reason: 'STAKE_SHORTFALL',
      sourceEventType: 'qualification.blocked',
    }),
  },
  {
    name: 'durable funding-required state asks for funds',
    state: 'paused_needs_approval',
    input: {
      viewerRole: 'seller',
      events: [event('stake.funding.required', 910, { shortfallUsdc: '125' })],
    },
    expected: expected('paused_needs_approval', {
      tone: 'attention',
      nextActor: 'seller',
      viewerMustAct: true,
      action: 'add_funds',
      reason: 'stake-funding-required',
      sourceEventType: 'stake.funding.required',
    }),
  },
  {
    name: 'durable uncertain financial state waits for reconciliation',
    state: 'status_updating',
    input: {
      events: [event('financial.reconciling', 920, { providerLifecycle: 'RECONCILING' })],
    },
    expected: expected('status_updating', {
      nextActor: 'platform',
      action: 'retry_status',
      reason: 'financial.reconciling',
      sourceEventType: 'financial.reconciling',
    }),
  },
  {
    name: 'durable re-engagement schedule remains recoverable',
    state: 'reengagement_scheduled',
    input: {
      events: [event('deal.room.reengagement_scheduled', 930, { trigger: 'FUNDS_CONFIRMED' })],
    },
    expected: expected('reengagement_scheduled', {
      nextActor: 'agents',
      sourceEventType: 'deal.room.reengagement_scheduled',
    }),
  },
];

function expected(
  state: MatchingPresentationState,
  overrides: Partial<MatchingPresentation> = {},
): MatchingPresentation {
  return {
    state,
    tone: 'neutral',
    live: true,
    terminal: false,
    recoverable: true,
    nextActor: 'agents',
    viewerMustAct: false,
    action: 'none',
    reason: null,
    sourceEventType: null,
    currentOffer: null,
    ...overrides,
  };
}
