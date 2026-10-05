/// Fixed reasons: the only words about a person's record that anyone else sees.
/// Each is a code with a published rule. None of them states a number.

export type ReasonCode =
  | 'NEW_ON_KARWAN'
  | 'HAS_COMPLETED_DEALS'
  | 'MANY_COMPLETED_DEALS'
  | 'USUALLY_ON_TIME'
  | 'NO_LOST_DISPUTES'
  | 'WORKS_WITH_MANY'
  | 'HUMAN_VERIFIED';

export interface SealedFacts {
  settled: number;
  distinctCounterparties: number;
  onTime: number;
  withDeadline: number;
  disputesLost: number;
  personVerified: boolean;
}

/// Testnet values. Mainnet values are set with the stage 2 record.
export const REASON_RULES = {
  manyDeals: 10,
  onTimeMinDeliveries: 3,
  onTimeMinShare: 0.8,
  noLostDisputesMinDeals: 3,
  manyCounterparties: 5,
} as const;

export const MAX_REASONS = 3;

export function reasonsFor(facts: SealedFacts): ReasonCode[] {
  const out: ReasonCode[] = [];
  if (facts.settled === 0) out.push('NEW_ON_KARWAN');
  else out.push(facts.settled >= REASON_RULES.manyDeals ? 'MANY_COMPLETED_DEALS' : 'HAS_COMPLETED_DEALS');
  if (
    facts.withDeadline >= REASON_RULES.onTimeMinDeliveries &&
    facts.onTime / facts.withDeadline >= REASON_RULES.onTimeMinShare
  ) {
    out.push('USUALLY_ON_TIME');
  }
  if (facts.settled >= REASON_RULES.noLostDisputesMinDeals && facts.disputesLost === 0) out.push('NO_LOST_DISPUTES');
  if (facts.distinctCounterparties >= REASON_RULES.manyCounterparties) out.push('WORKS_WITH_MANY');
  if (facts.personVerified) out.push('HUMAN_VERIFIED');
  return out.slice(0, MAX_REASONS);
}
