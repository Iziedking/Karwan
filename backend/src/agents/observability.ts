import { bus } from '../events.js';

/// Where a decision came from. The whole point of the reliability doctrine
/// (docs/agent.md) is that you can always tell whether the model decided, the
/// deterministic spine decided, or the spine caught a model failure.
export type DecisionSource = 'llm' | 'deterministic' | 'fallback' | 'cache';

/// Which step of the negotiation loop made the call.
export type DecisionStage =
  | 'relevance'
  | 'price-feasibility'
  | 'bid'
  | 'counter'
  | 'match'
  | 'near-miss';

export interface AgentDecisionInput {
  jobId?: string;
  actor: 'buyer' | 'seller' | 'platform';
  stage: DecisionStage;
  /// The outcome, in one short word: matched, skipped, bid, accept, counter, etc.
  decision: string;
  source: DecisionSource;
  /// Short machine code for the reason (rendered via REASON_LABELS on the UI).
  reason?: string;
  /// One-line human-readable detail.
  detail?: string;
  /// The LLM's reasoning text, when an LLM produced the decision.
  reasoning?: string;
  /// Deterministic inputs that drove the call (topical overlap, prices, tier...).
  /// Spread onto the payload so the timeline's chip builder can surface them.
  signals?: Record<string, unknown>;
}

/// Emit one unified agent-decision event. This is the observability spine: every
/// gate that decides something should leave one of these so the reasoning is
/// visible on the timeline instead of only in the backend logs. It sits
/// alongside the flow events (bid.submitted, deal.matched, ...); it does not
/// replace them.
export function emitAgentDecision(d: AgentDecisionInput): void {
  bus.emitEvent({
    type: 'agent.decision',
    jobId: d.jobId,
    actor: d.actor,
    payload: {
      stage: d.stage,
      decision: d.decision,
      source: d.source,
      ...(d.reason ? { reason: d.reason } : {}),
      ...(d.detail ? { detail: d.detail } : {}),
      ...(d.reasoning ? { reasoning: d.reasoning } : {}),
      ...(d.signals ?? {}),
    },
  });
}
