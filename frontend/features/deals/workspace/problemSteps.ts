import type { DealDisputeView } from '@/core/api';

export type ProblemStepKey = 'opened' | 'answer' | 'decides';

export interface ProblemStep {
  key: ProblemStepKey;
  state: 'done' | 'current' | 'upcoming';
}

/// The steps of an open problem (view 44, P12): it was opened, the other side
/// answers by the date, then Karwan decides. A passed date says so rather than
/// showing a date in the past as if it were still ahead.
export function problemSteps(dispute: DealDisputeView, now: number): { steps: ProblemStep[]; answerPassed: boolean } {
  const ruled = dispute.proposal?.status === 'confirmed' || dispute.proposal?.status === 'overridden';
  const answerPassed = !dispute.otherSubmitted && (!dispute.open || now > dispute.closesAt);
  const answered = dispute.otherSubmitted || answerPassed || !!dispute.proposal;
  return {
    steps: [
      { key: 'opened', state: 'done' },
      { key: 'answer', state: answered ? 'done' : 'current' },
      { key: 'decides', state: ruled ? 'done' : answered ? 'current' : 'upcoming' },
    ],
    answerPassed,
  };
}
