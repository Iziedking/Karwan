/// The setup conversation (docs/architecture/39-start-to-home.md). Only the
/// questions a person's goals need are asked; the Telegram interview in
/// backend/src/channels/interview.ts still keeps its own, longer order.

export type Goal = 'work' | 'sell' | 'buy' | 'business' | 'record';

export type SetupStep =
  | 'goals'
  | 'work'
  | 'buy'
  | 'business'
  | 'places'
  | 'contact'
  | 'paid'
  | 'own'
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

/// What setup offers to post next: the words handed to the assistant, which
/// shows the card (backend/src/agents/firstPost.ts).
export type SetupFirstPost = { kind: 'offer' | 'request'; handOff: string };

export const TEXT_STEPS = ['buy', 'business', 'places'] as const;
/// Asked only when the person changes them from the summary.
export const CHOICE_STEPS = ['paid', 'own'] as const;
export type TextStep = (typeof TEXT_STEPS)[number];
export type ChoiceStep = (typeof CHOICE_STEPS)[number];

export const sells = (goals: readonly Goal[]) => goals.includes('work') || goals.includes('sell');
/// Whether "Do you have clients already?" applies: someone who sells or buys.
export const asksClients = (goals: readonly Goal[]) => sells(goals) || goals.includes('buy');

export function setupSteps(goals: readonly Goal[]): SetupStep[] {
  const has = (g: Goal) => goals.includes(g);
  return [
    'goals',
    ...(sells(goals) ? (['work'] as const) : []),
    ...(has('buy') ? (['buy'] as const) : []),
    ...(has('business') ? (['business'] as const) : []),
    ...(has('record') ? (['places'] as const) : []),
    'contact',
    'reading',
    'summary',
  ];
}

/// A step with Back and Next under it.
export const isQuestionStep = (step: SetupStep) => step !== 'reading' && step !== 'summary';

/// How far through "About you" the person is, from 0 to 1, for the bar on
/// /start. The goals question decides how many follow, so it counts as the
/// first of however many there are now.
export function aboutProgress(steps: readonly SetupStep[], current: SetupStep): number {
  if (current === 'summary') return 1;
  const asked: SetupStep[] = steps.filter((s) => isQuestionStep(s));
  const at = asked.indexOf(current);
  if (current === 'reading') return asked.length / (asked.length + 1);
  return at < 0 ? 0 : at / (asked.length + 1);
}

/// What the person was not asked starts from a sensible answer they can change
/// on the summary: paid all at once (or on arrival for goods), and an agent
/// that offers within their price but asks before any deal.
export function withDefaults(answers: SetupAnswers): SetupAnswers {
  const out = { ...answers };
  if (sells(answers.goals) && !out.paid) {
    out.paid = answers.goals.includes('sell') && !answers.goals.includes('work') ? 'goods' : 'one_time';
  }
  if (!out.own) out.own = 'offers';
  return out;
}
