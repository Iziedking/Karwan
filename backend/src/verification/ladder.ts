import type { VerificationLevel } from '../reputation/external.js';

/// The verification ladder. Pure and deterministic: the same facts always give
/// the same level, and the rules are published in docs/reputation-model.md.
/// Nothing here is decided by a model.

export type FactKind =
  | 'owned_account'
  | 'person_check'
  | 'client_confirmation'
  | 'invoice'
  | 'cac_match'
  | 'github_work'
  | 'karwan_deal'
  | 'id_check';

export interface Fact {
  kind: FactKind;
  level: VerificationLevel | 'person' | 'id_verified';
  issuedAt: number;
  expiresAt: number;
  /// A client confirmation from a different, person-verified account.
  independent?: boolean;
  /// An invoice whose client, a different verified person, confirmed the job.
  corroborated?: boolean;
}

export type Ladder = 'registered' | 'person_verified' | 'work_verified' | 'id_verified';

export function ladderFor(facts: readonly Fact[], now: number): Ladder {
  const valid = facts.filter((f) => f.expiresAt > now && f.level !== 'self_reported');
  const has = (kind: FactKind, test: (f: Fact) => boolean = () => true) => valid.some((f) => f.kind === kind && test(f));

  // A government ID check proves the person as well; World ID is not available
  // everywhere people trade.
  const person = (has('person_check') || has('id_check')) && (has('owned_account') || has('cac_match'));
  if (!person) return 'registered';

  // A confirmation counts only from a different verified person: the person
  // picks who to ask, so an unverified number can be their own second SIM. An
  // invoice or a business registration backs a job only through such a
  // confirmation, never on its own.
  const work =
    has('client_confirmation', (f) => f.independent === true) ||
    has('github_work') ||
    has('karwan_deal');
  if (!work) return 'person_verified';

  return has('id_check') ? 'id_verified' : 'work_verified';
}

/// Agents only ever find people whose work is verified.
export function isDiscoverable(level: Ladder): boolean {
  return level === 'work_verified' || level === 'id_verified';
}

export type NextStep = 'person_check' | 'owned_account' | 'work_evidence';

/// What is still missing for work verified, in the order to do it. The ID
/// check is never a step here: it is asked for only when a deal needs it.
export function nextSteps(facts: readonly Fact[], now: number): NextStep[] {
  const valid = facts.filter((f) => f.expiresAt > now && f.level !== 'self_reported');
  const has = (kind: FactKind) => valid.some((f) => f.kind === kind);
  const steps: NextStep[] = [];
  if (!has('person_check') && !has('id_check')) steps.push('person_check');
  if (!has('owned_account') && !has('cac_match')) steps.push('owned_account');
  const level = ladderFor(facts, now);
  if (level !== 'work_verified' && level !== 'id_verified') steps.push('work_evidence');
  return steps;
}
