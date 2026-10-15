/// Fixed rules that use the CRE evidence. None of them moves money: a proposal
/// is what the automatic arbiter may propose, inside what the contract allows
/// (full refund, full payment, or the partial share in the terms), and either
/// party can appeal it to the reviewer Safes.

export type Proposal = { kind: 'propose'; sellerBps: number } | { kind: 'escalate' };

export function proposalFromEvidence(
  terms: { partialBps: number },
  policy: { partialAt: number | null },
  evidence: { decision: 'PASS' | 'FAIL' | 'UNAVAILABLE'; passed: number; required: number } | null,
): Proposal {
  if (!evidence || evidence.decision === 'UNAVAILABLE') return { kind: 'escalate' };
  if (evidence.decision === 'PASS') return { kind: 'propose', sellerBps: 10_000 };
  const partial = terms.partialBps > 0 && policy.partialAt !== null && evidence.passed >= policy.partialAt;
  return { kind: 'propose', sellerBps: partial ? terms.partialBps : 0 };
}

/// Karwan's own checks answer on the CRE-or-Karwan verifier only when CRE has
/// not, the chain shows no result for the revision, and the fallback time has
/// passed. A DON error therefore never blocks a deal.
export function fallbackDue(input: {
  deliveredAtMs: number;
  nowMs: number;
  chainHasResult: boolean;
  creAnswered: boolean;
  afterMs: number;
}): boolean {
  return !input.chainHasResult && !input.creAnswered && input.nowMs - input.deliveredAtMs >= input.afterMs;
}

/// The verifier a new deal names. Read at funding: a deal keeps it for life.
export function verifierForFunding(s: { creEnabled: boolean; verifierK?: string; verifierCK?: string }): string | null {
  return (s.creEnabled ? s.verifierCK : s.verifierK) ?? null;
}
