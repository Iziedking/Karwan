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
  | 'summary';

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

const isQuestion = (step: SetupStep) => step !== 'welcome' && step !== 'reading' && step !== 'summary';

/// "3 of 7" for the progress line; null where there is no question.
export function questionProgress(steps: readonly SetupStep[], current: SetupStep): { index: number; total: number } | null {
  if (!isQuestion(current)) return null;
  const questions = steps.filter(isQuestion);
  const at = questions.indexOf(current);
  return at < 0 ? null : { index: at + 1, total: questions.length };
}
