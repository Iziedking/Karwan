/// The setup conversation after activation (docs/architecture/19-simple-karwan.md).
/// Only the questions a person's goals need are asked; the server mirror of
/// this order is backend/src/channels/interview.ts.

export type Goal = 'work' | 'sell' | 'buy' | 'business' | 'record';

export type SetupStep =
  | 'welcome'
  | 'goals'
  | 'what'
  | 'price'
  | 'paid'
  | 'buy'
  | 'business'
  | 'places'
  | 'clients'
  | 'own'
  | 'reach'
  | 'where'
  | 'reading'
  | 'summary'
  | 'post';

export interface SetupAnswers {
  goals: Goal[];
  what?: string;
  price?: string;
  buy?: string;
  business?: string;
  places?: string;
  clients?: 'own' | 'find' | 'both';
  own?: 'offers' | 'ask';
  reach?: 'telegram' | 'email' | 'both';
  where?: string;
  paid?: 'one_time' | 'milestones' | 'goods';
  retried?: boolean;
}

/// What setup offers to post next: the words handed to the assistant, which
/// shows the card (backend/src/agents/firstPost.ts).
export type SetupFirstPost = { kind: 'offer' | 'request'; handOff: string };

export const TEXT_STEPS = ['what', 'price', 'buy', 'business', 'places', 'where'] as const;
export const CHOICE_STEPS = ['paid', 'clients', 'own', 'reach'] as const;
export type TextStep = (typeof TEXT_STEPS)[number];
export type ChoiceStep = (typeof CHOICE_STEPS)[number];

export function setupSteps(goals: readonly Goal[]): SetupStep[] {
  const has = (g: Goal) => goals.includes(g);
  const selling = has('work') || has('sell');
  return [
    'welcome',
    'goals',
    ...(selling ? (['what', 'price', 'paid'] as const) : []),
    ...(has('buy') ? (['buy'] as const) : []),
    ...(has('business') ? (['business'] as const) : []),
    ...(has('record') ? (['places'] as const) : []),
    ...(selling || has('buy') ? (['clients'] as const) : []),
    'own',
    'reach',
    'where',
    'reading',
    'summary',
  ];
}

/// A step with Back and Next under it.
export const isQuestionStep = (step: SetupStep) => step !== 'welcome' && step !== 'reading' && step !== 'summary' && step !== 'post';

/// "3 of 7" for the progress line; null where there is no count. The goals
/// question has none: its answer decides how many questions follow, so a count
/// shown there would jump (view 38).
export function questionProgress(steps: readonly SetupStep[], current: SetupStep): { index: number; total: number } | null {
  const counted = (step: SetupStep) => isQuestionStep(step) && step !== 'goals';
  if (!counted(current)) return null;
  const questions = steps.filter(counted);
  const at = questions.indexOf(current);
  return at < 0 ? null : { index: at + 1, total: questions.length };
}
