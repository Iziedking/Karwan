import type { BuyerJob, ChainEvent, MatchProposal } from '@/core/api';

export const MATCHING_PRESENTATION_STATES = [
  'reviewing',
  'match_ready',
  'awaiting_user_review',
  'terms_changed',
  'paused_needs_approval',
  'reengagement_scheduled',
  'funding_ready',
  'settling',
  'completed',
  'temporarily_unavailable',
  'status_updating',
] as const;

export type MatchingPresentationState = (typeof MATCHING_PRESENTATION_STATES)[number];
export type MatchingActor = 'buyer' | 'seller' | 'agents' | 'platform' | 'none';
export type MatchingPresentationAction =
  | 'none'
  | 'review_match'
  | 'review_terms'
  | 'add_funds'
  | 'review_reserve'
  | 'review_request'
  | 'retry_status';

export type MatchingPresentationTone = 'neutral' | 'attention' | 'positive' | 'critical';

export interface MatchingOfferPresentation {
  amountUsdc: string;
  revision: 'initial' | 'changed' | 'unknown';
  updatedAt: number;
}

export interface MatchingPresentation {
  state: MatchingPresentationState;
  tone: MatchingPresentationTone;
  live: boolean;
  terminal: boolean;
  recoverable: boolean;
  nextActor: MatchingActor;
  viewerMustAct: boolean;
  action: MatchingPresentationAction;
  reason: string | null;
  sourceEventType: string | null;
  currentOffer: MatchingOfferPresentation | null;
}

type ProposalSnapshot = Pick<
  MatchProposal,
  | 'buyerUser'
  | 'sellerUser'
  | 'agreedPriceUsdc'
  | 'proposedAt'
  | 'approvedAt'
  | 'declinedAt'
  | 'raisedPriceUsdc'
  | 'raisedAt'
  | 'awaitingParty'
  | 'fundable'
>;

type JobSnapshot = Pick<BuyerJob, 'finalized' | 'escrowFunded' | 'expiredAt'>;

export interface MatchingPresentationInput {
  events?: readonly ChainEvent[];
  proposal?: ProposalSnapshot | null;
  job?: JobSnapshot | null;
  viewerAddress?: string | null;
  viewerRole?: 'buyer' | 'seller' | null;
  /** Compatibility input for current callers that only know the old terminal flag. */
  terminal?: boolean;
}

export function formatMatchingTimestamp(value: number, locale = 'en-US'): string {
  const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) return '';

  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    .format(date)
    .toUpperCase();
  return `${hour}:${minute} UTC · ${day} ${month}`;
}

interface EventProjection {
  state: MatchingPresentationState;
  nextActor?: MatchingActor;
  action?: MatchingPresentationAction;
  reason?: string | null;
  terminal?: boolean;
  recoverable?: boolean;
  sourceEventType: string;
}

/**
 * Pure projection from today's proposal, job, and event payloads to safe UI
 * semantics. It performs no reads, writes, timers, model calls, or wallet work.
 */
export function presentMatchingState(input: MatchingPresentationInput): MatchingPresentation {
  const events = [...(input.events ?? [])].sort((a, b) => a.ts - b.ts);
  const viewerRole = resolveViewerRole(input);
  const currentOffer = offerFromProposal(input.proposal) ?? offerFromEvents(events);
  let latest: EventProjection | null = null;

  for (const event of events) {
    const projection = projectEvent(event);
    if (projection) latest = projection;
  }

  if (latest?.state === 'completed') {
    return buildPresentation(latest, viewerRole, currentOffer);
  }

  if (input.job?.escrowFunded || latest?.state === 'settling') {
    return buildPresentation(
      latest?.state === 'settling'
        ? latest
        : { state: 'settling', sourceEventType: latest?.sourceEventType ?? 'job.snapshot' },
      viewerRole,
      currentOffer,
    );
  }

  if (input.job?.expiredAt) {
    return buildPresentation(
      {
        state: 'temporarily_unavailable',
        nextActor: 'none',
        action: 'none',
        reason: 'request-expired',
        terminal: true,
        recoverable: false,
        sourceEventType: latest?.sourceEventType ?? 'job.snapshot',
      },
      viewerRole,
      currentOffer,
    );
  }

  const proposalProjection = projectProposal(input.proposal, viewerRole);
  if (proposalProjection) {
    return buildPresentation(proposalProjection, viewerRole, currentOffer);
  }

  if (latest) {
    return buildPresentation(latest, viewerRole, currentOffer);
  }

  if (input.terminal) {
    return buildPresentation(
      {
        state: 'temporarily_unavailable',
        nextActor: 'buyer',
        action: 'review_request',
        reason: 'legacy-terminal-signal',
        sourceEventType: 'legacy.terminal',
      },
      viewerRole,
      currentOffer,
    );
  }

  if (input.job?.finalized) {
    return buildPresentation(
      {
        state: 'status_updating',
        nextActor: 'platform',
        action: 'retry_status',
        reason: 'finalized-without-confirmed-outcome',
        sourceEventType: 'job.snapshot',
      },
      viewerRole,
      currentOffer,
    );
  }

  if (events.length > 0) {
    return buildPresentation(
      {
        state: 'status_updating',
        nextActor: 'platform',
        action: 'retry_status',
        reason: 'unrecognized-state',
        sourceEventType: events[events.length - 1]?.type ?? 'unknown',
      },
      viewerRole,
      currentOffer,
    );
  }

  return buildPresentation(
    { state: 'reviewing', nextActor: 'agents', sourceEventType: nullEventType },
    viewerRole,
    currentOffer,
  );
}

const nullEventType = 'none';

function resolveViewerRole(input: MatchingPresentationInput): 'buyer' | 'seller' | null {
  if (input.viewerRole) return input.viewerRole;
  const proposal = input.proposal;
  const viewer = input.viewerAddress?.toLowerCase();
  if (!proposal || !viewer) return null;
  if (proposal.buyerUser.toLowerCase() === viewer) return 'buyer';
  if (proposal.sellerUser.toLowerCase() === viewer) return 'seller';
  return null;
}

function projectProposal(
  proposal: ProposalSnapshot | null | undefined,
  viewerRole: 'buyer' | 'seller' | null,
): EventProjection | null {
  if (!proposal) return null;
  if (proposal.approvedAt) {
    return { state: 'settling', nextActor: 'platform', sourceEventType: 'proposal.approved' };
  }
  if (proposal.declinedAt) {
    return {
      state: 'temporarily_unavailable',
      nextActor: 'buyer',
      action: 'review_request',
      reason: 'proposal-declined',
      sourceEventType: 'proposal.declined',
    };
  }
  if (proposal.fundable === false) {
    return {
      state: 'paused_needs_approval',
      nextActor: 'buyer',
      action: 'add_funds',
      reason: 'buyer-funding-shortfall',
      sourceEventType: 'proposal.funding',
    };
  }

  const awaiting = proposal.awaitingParty ?? 'seller';
  if (proposal.raisedPriceUsdc && awaiting === 'buyer') {
    return {
      state: 'terms_changed',
      nextActor: 'buyer',
      action: 'review_terms',
      sourceEventType: 'proposal.raised',
    };
  }

  return viewerRole === awaiting
    ? {
        state: 'awaiting_user_review',
        nextActor: awaiting,
        action: 'review_match',
        sourceEventType: 'proposal.pending',
      }
    : {
        state: 'match_ready',
        nextActor: awaiting,
        sourceEventType: 'proposal.pending',
      };
}

function projectEvent(event: ChainEvent): EventProjection | null {
  const reason = readString(event.payload.reason);

  switch (event.type) {
    case 'job.posted':
    case 'job.tracked':
    case 'market.scanned':
    case 'bid.scored':
    case 'bid.submitted':
    case 'counter.issued':
    case 'counter.received':
    case 'counter.evaluated':
    case 'counter.response.submitted':
      return { state: 'reviewing', nextActor: 'agents', sourceEventType: event.type };
    case 'deal.matched':
    case 'listing.matched':
      return { state: 'match_ready', nextActor: 'seller', sourceEventType: event.type };
    case 'negotiation.offer.published':
      // Structured offers are durable, versioned observations. The event
      // actor is the proposer, so the opposite party is the next reviewer;
      // this remains presentation-only and never implies acceptance.
      if (event.actor === 'seller') {
        return {
          state: 'terms_changed',
          nextActor: 'buyer',
          action: 'review_terms',
          sourceEventType: event.type,
        };
      }
      return { state: 'match_ready', nextActor: 'seller', sourceEventType: event.type };
    case 'negotiation.offer.accepted':
      // Acceptance is an observed negotiation result. Funding/settlement is
      // still a separate confirmed state and remains platform-owned.
      return { state: 'funding_ready', nextActor: 'platform', sourceEventType: event.type };
    case 'negotiation.near-miss': {
      const askedSide = event.payload.askedSide === 'buyer' ? 'buyer' : 'seller';
      return {
        state: 'awaiting_user_review',
        nextActor: askedSide,
        action: 'review_match',
        sourceEventType: event.type,
      };
    }
    case 'deal.match.raised':
      return {
        state: 'terms_changed',
        nextActor: 'buyer',
        action: 'review_terms',
        sourceEventType: event.type,
      };
    case 'agent.skipped':
      if (reason !== 'insufficient-stake-trusted-match') return null;
      return {
        state: 'paused_needs_approval',
        nextActor: 'seller',
        action: 'review_reserve',
        reason,
        sourceEventType: event.type,
      };
    // Durable agent-runtime qualification and approval events are projected
    // into the same safe review surface as the legacy stake signal. These
    // branches are presentation-only: they do not infer that a wallet call,
    // approval, or provider operation happened.
    case 'qualification.blocked':
    case 'stake.required':
    case 'approval.requested':
      return {
        state: 'paused_needs_approval',
        nextActor: event.payload.approverRole === 'buyer' ? 'buyer' : 'seller',
        action: 'review_reserve',
        reason: reason ?? (event.type === 'approval.requested' ? 'approval-requested' : 'stake-required'),
        sourceEventType: event.type,
      };
    case 'stake.funding.required':
      return {
        state: 'paused_needs_approval',
        nextActor: 'seller',
        action: 'add_funds',
        reason: reason ?? 'stake-funding-required',
        sourceEventType: event.type,
      };
    case 'approval.expired':
      return {
        state: 'paused_needs_approval',
        nextActor: event.payload.approverRole === 'buyer' ? 'buyer' : 'seller',
        action: 'review_reserve',
        reason: reason ?? 'approval-expired',
        sourceEventType: event.type,
      };
    case 'evidence.pending':
    case 'evidence.unknown':
    case 'financial.provider.unknown':
    case 'financial.reconciling':
      return {
        state: 'status_updating',
        nextActor: 'platform',
        action: 'retry_status',
        reason: reason ?? event.type,
        sourceEventType: event.type,
      };
    case 'deal.room.reengagement_scheduled':
      return {
        state: 'reengagement_scheduled',
        nextActor: 'agents',
        sourceEventType: event.type,
      };
    case 'deal.room.temporary_impasse':
      return temporaryProjection(event.type, reason ?? 'temporary-impasse');
    case 'negotiation.reopened':
    case 'negotiation.next-candidate':
    case 'negotiation.near-miss.declined':
    case 'negotiation.near-miss.superseded':
      return {
        state: 'reengagement_scheduled',
        nextActor: 'agents',
        sourceEventType: event.type,
      };
    case 'bid.accepted':
    case 'escrow.approved':
      return { state: 'funding_ready', nextActor: 'platform', sourceEventType: event.type };
    case 'deal.match.approved':
    case 'escrow.funded':
    case 'escrow.milestone.released':
      return { state: 'settling', nextActor: 'platform', sourceEventType: event.type };
    case 'escrow.settled':
      return {
        state: 'completed',
        nextActor: 'none',
        terminal: true,
        recoverable: false,
        sourceEventType: event.type,
      };
    case 'negotiation.exhausted':
      if (event.payload.nearMissRaised === true) {
        return {
          state: 'awaiting_user_review',
          nextActor: 'buyer',
          action: 'review_match',
          reason: 'near-miss-raised',
          sourceEventType: event.type,
        };
      }
      return temporaryProjection(event.type, reason ?? 'candidates-exhausted');
    case 'negotiation.attempt-ended':
    case 'negotiation.out-of-reach':
    case 'agent.declined':
    case 'agent.error':
    case 'deal.match.declined':
      return temporaryProjection(event.type, reason);
    case 'job.expired':
    case 'brief.cancelled':
      return {
        state: 'temporarily_unavailable',
        nextActor: 'none',
        action: 'none',
        reason: reason ?? (event.type === 'job.expired' ? 'request-expired' : 'request-cancelled'),
        terminal: true,
        recoverable: false,
        sourceEventType: event.type,
      };
    default:
      return null;
  }
}

function temporaryProjection(sourceEventType: string, reason: string | null): EventProjection {
  return {
    state: 'temporarily_unavailable',
    nextActor: 'buyer',
    action: 'review_request',
    reason,
    sourceEventType,
  };
}

function buildPresentation(
  projection: EventProjection,
  viewerRole: 'buyer' | 'seller' | null,
  currentOffer: MatchingOfferPresentation | null,
): MatchingPresentation {
  const defaults = stateDefaults(projection.state);
  const nextActor = projection.nextActor ?? defaults.nextActor;
  const action = projection.action ?? (
    projection.state === 'match_ready' && viewerRole === 'seller' && nextActor === 'seller'
      ? 'review_match'
      : defaults.action
  );

  return {
    state: projection.state,
    tone: defaults.tone,
    live: defaults.live,
    terminal: projection.terminal ?? defaults.terminal,
    recoverable: projection.recoverable ?? defaults.recoverable,
    nextActor,
    viewerMustAct: viewerRole !== null && nextActor === viewerRole && action !== 'none',
    action,
    reason: projection.reason ?? null,
    sourceEventType: projection.sourceEventType === nullEventType ? null : projection.sourceEventType,
    currentOffer,
  };
}

function stateDefaults(state: MatchingPresentationState): {
  tone: MatchingPresentationTone;
  live: boolean;
  terminal: boolean;
  recoverable: boolean;
  nextActor: MatchingActor;
  action: MatchingPresentationAction;
} {
  switch (state) {
    case 'reviewing':
      return liveDefaults('agents');
    case 'match_ready':
      return { ...liveDefaults('seller'), tone: 'positive' };
    case 'awaiting_user_review':
      return { ...liveDefaults('seller'), tone: 'attention', action: 'review_match' };
    case 'terms_changed':
      return { ...liveDefaults('buyer'), tone: 'attention', action: 'review_terms' };
    case 'paused_needs_approval':
      return { ...liveDefaults('seller'), tone: 'attention', action: 'review_reserve' };
    case 'reengagement_scheduled':
      return liveDefaults('agents');
    case 'funding_ready':
      return { ...liveDefaults('platform'), tone: 'positive' };
    case 'settling':
      return { ...liveDefaults('platform'), tone: 'positive' };
    case 'completed':
      return {
        tone: 'positive',
        live: false,
        terminal: true,
        recoverable: false,
        nextActor: 'none',
        action: 'none',
      };
    case 'temporarily_unavailable':
      return {
        tone: 'critical',
        live: false,
        terminal: false,
        recoverable: true,
        nextActor: 'buyer',
        action: 'review_request',
      };
    case 'status_updating':
      return {
        tone: 'neutral',
        live: true,
        terminal: false,
        recoverable: true,
        nextActor: 'platform',
        action: 'retry_status',
      };
  }
}

function liveDefaults(nextActor: MatchingActor) {
  return {
    tone: 'neutral' as const,
    live: true,
    terminal: false,
    recoverable: true,
    nextActor,
    action: 'none' as const,
  };
}

function offerFromProposal(
  proposal: ProposalSnapshot | null | undefined,
): MatchingOfferPresentation | null {
  if (!proposal) return null;
  const changed = proposal.raisedPriceUsdc != null;
  return {
    amountUsdc: changed ? proposal.raisedPriceUsdc! : proposal.agreedPriceUsdc,
    revision: changed ? 'changed' : 'initial',
    updatedAt: changed ? (proposal.raisedAt ?? proposal.proposedAt) : proposal.proposedAt,
  };
}

function offerFromEvents(events: readonly ChainEvent[]): MatchingOfferPresentation | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    const structured = event.structuredOffer;
    if (
      structured &&
      structured.id.trim().length > 0 &&
      Number.isSafeInteger(structured.version) &&
      structured.version > 0 &&
      /^\d+(?:\.\d{1,6})?$/.test(structured.amountUsdc) &&
      Number.isFinite(structured.updatedAt) &&
      structured.updatedAt > 0
    ) {
      return {
        amountUsdc: structured.amountUsdc,
        revision: structured.version === 1 ? 'initial' : 'changed',
        updatedAt: structured.updatedAt,
      };
    }
    const amount = readOfferAmount(event.payload);
    if (amount) {
      return { amountUsdc: amount, revision: 'unknown', updatedAt: event.ts };
    }
  }
  return null;
}

function readOfferAmount(payload: Record<string, unknown>): string | null {
  const raw =
    payload.raisedPriceUsdc ??
    payload.agreedPriceUsdc ??
    payload.counterPriceUsdc ??
    payload.counterPrice ??
    payload.priceUsdc ??
    payload.askedPriceUsdc ??
    payload.proceedPriceUsdc;
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
