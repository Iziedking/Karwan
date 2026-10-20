import type { UserProfile } from '@/core/api';
import { setupSteps, type Goal, type SetupAnswers, type SetupStep } from './setupSteps';

/// Where a person is in the setup conversation, and what they answered.
export interface SetupState {
  step: SetupStep;
  answers: SetupAnswers;
  /// "Here's your Karwan", as the server read it.
  lines: string[];
  /// 1 moving forward, -1 going back: which edge the next card enters from.
  direction: 1 | -1;
}

type Answerable = Exclude<keyof SetupAnswers, 'goals' | 'retried'>;

export type SetupEvent =
  | { type: 'start' }
  | { type: 'toggleGoal'; goal: Goal }
  | { type: 'answer'; step: Answerable; value: string }
  | { type: 'pick'; step: 'clients' | 'own' | 'reach'; value: string }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'read'; lines: string[]; needs: Array<'price'> }
  | { type: 'edit' }
  | { type: 'resume'; answers: SetupAnswers; lines: string[] };

export function initialSetup(): SetupState {
  return { step: 'welcome', answers: { goals: [] }, lines: [], direction: 1 };
}

function move(state: SetupState, by: 1 | -1): SetupState {
  const steps = setupSteps(state.answers.goals);
  const at = steps.indexOf(state.step);
  const next = steps[Math.min(Math.max(at + by, 0), steps.length - 1)]!;
  return { ...state, step: next, direction: by };
}

export function setupReducer(state: SetupState, event: SetupEvent): SetupState {
  switch (event.type) {
    case 'start':
      return { ...state, step: 'goals', direction: 1 };
    case 'toggleGoal': {
      const goals = state.answers.goals.includes(event.goal)
        ? state.answers.goals.filter((g) => g !== event.goal)
        : [...state.answers.goals, event.goal];
      return { ...state, answers: { ...state.answers, goals } };
    }
    case 'answer':
    case 'pick':
      return { ...state, answers: { ...state.answers, [event.step]: event.value } };
    case 'next':
      return move(state, 1);
    case 'back':
      return state.step === 'welcome' ? state : move(state, -1);
    case 'skip': {
      const answers = { ...state.answers };
      if (state.step !== 'goals' && state.step in answers) delete answers[state.step as Answerable];
      return move({ ...state, answers }, 1);
    }
    case 'read':
      if (event.needs.includes('price')) {
        return { ...state, step: 'price', direction: -1, answers: { ...state.answers, retried: true } };
      }
      return { ...state, step: 'summary', lines: event.lines, direction: 1 };
    case 'edit':
      return { ...state, step: 'goals', direction: -1 };
    case 'resume':
      return { ...state, step: 'summary', answers: event.answers, lines: event.lines, direction: 1 };
  }
}

/// The saved answers, for "Change" under Me: the conversation reopens on the
/// summary with everything the person said last time.
export function answersFromProfile(
  profile: Pick<UserProfile, 'goals' | 'ownWords' | 'agentPrefs' | 'settings' | 'workPlaces'> | null | undefined,
): SetupAnswers {
  if (!profile) return { goals: [] };
  const words = profile.ownWords ?? {};
  const prefs = profile.agentPrefs;
  const out: SetupAnswers = { goals: profile.goals ?? [] };
  if (words.what) out.what = words.what;
  if (words.price) out.price = words.price;
  if (words.buy) out.buy = words.buy;
  if (words.business) out.business = words.business;
  if (profile.workPlaces) out.places = profile.workPlaces;
  if (prefs?.findClients !== undefined) out.clients = prefs.findClients ? 'find' : 'own';
  if (prefs?.agentMode) out.own = prefs.agentMode;
  if (profile.settings?.notifyVia) out.reach = profile.settings.notifyVia;
  return out;
}
