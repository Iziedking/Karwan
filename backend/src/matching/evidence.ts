import type {
  MatchingCandidateSnapshot,
  MatchingEvidenceSummary,
  MatchingSkillEvidence,
  MatchingTransactionEvidence,
} from './types.js';

function isFresh(expiresAtUnix: number | undefined, nowUnix: number): boolean {
  return expiresAtUnix === undefined || expiresAtUnix > nowUnix;
}

export function summarizeEvidence(
  candidate: MatchingCandidateSnapshot,
  nowUnix: number,
): MatchingEvidenceSummary {
  const declaredSkillIds = [...new Set((candidate.declaredSkills ?? candidate.keywords).map((value) => value.toLowerCase()))].sort();
  const verifiedSkillIds: string[] = [];
  const expiredSkillIds: string[] = [];
  const revokedSkillIds: string[] = [];
  const evidenceIds: string[] = [];

  for (const evidence of candidate.skillEvidence ?? []) {
    if (evidence.evidenceId) evidenceIds.push(evidence.evidenceId);
    if (evidence.status === 'verified' && isFresh(evidence.expiresAtUnix, nowUnix)) {
      verifiedSkillIds.push(evidence.skillId.toLowerCase());
    } else if (evidence.status === 'expired' || (evidence.status === 'verified' && !isFresh(evidence.expiresAtUnix, nowUnix))) {
      expiredSkillIds.push(evidence.skillId.toLowerCase());
    } else if (evidence.status === 'revoked') {
      revokedSkillIds.push(evidence.skillId.toLowerCase());
    }
  }

  const transactionEvidence = candidate.transactionEvidence ?? [];
  const reliable = transactionEvidence.filter((item) => isReliableTransactionEvidence(item, nowUnix));
  const uncertain = transactionEvidence.filter((item) => !isReliableTransactionEvidence(item, nowUnix));
  for (const item of transactionEvidence) {
    if (item.evidenceId) evidenceIds.push(item.evidenceId);
  }

  const clean = reliable.reduce((sum, item) => sum + Math.max(0, item.completed), 0);
  const disputed = reliable.reduce((sum, item) => sum + Math.max(0, item.disputed), 0);
  const failed = reliable.reduce((sum, item) => sum + Math.max(0, item.failed), 0);
  const total = clean + disputed + failed;
  const reliabilityScore = total === 0
    ? 50
    : Math.max(0, Math.min(100, Math.round((clean / total) * 100 - (disputed / total) * 30 - (failed / total) * 40)));

  return {
    declaredSkillIds,
    verifiedSkillIds: [...new Set(verifiedSkillIds)].sort(),
    expiredSkillIds: [...new Set(expiredSkillIds)].sort(),
    revokedSkillIds: [...new Set(revokedSkillIds)].sort(),
    reliabilityScore,
    reliableTransactionCount: reliable.length,
    uncertainTransactionCount: uncertain.length,
    evidenceIds: [...new Set(evidenceIds)].sort(),
  };
}

export function isReliableTransactionEvidence(
  evidence: MatchingTransactionEvidence,
  nowUnix: number,
): boolean {
  if (!evidence.verified || !isFresh(evidence.expiresAtUnix, nowUnix)) return false;
  if (evidence.source === 'self_asserted') return false;
  // A paid response is not decision-grade until the payment is settled. A
  // submitted, unknown, or reconciling provider payment must remain visible
  // as uncertain and cannot improve the reliability band.
  if (evidence.source === 'paid_x402' && evidence.paymentStatus !== 'SETTLED') {
    return false;
  }
  // A provider total without a durable evidence snapshot/reference cannot be
  // recovered, replayed, or tied to the exact decision input. Keep it
  // uncertain even when the provider claims settlement.
  if (evidence.source === 'paid_x402' && !evidence.evidenceId) return false;
  return true;
}

export function verifiedSkillEvidence(
  evidence: readonly MatchingSkillEvidence[] | undefined,
  nowUnix: number,
): string[] {
  return (evidence ?? [])
    .filter((item) => item.status === 'verified' && isFresh(item.expiresAtUnix, nowUnix))
    .map((item) => item.skillId.toLowerCase())
    .sort();
}
