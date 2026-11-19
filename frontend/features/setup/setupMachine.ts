import type { UserProfile } from '@/core/api';
import { canGoOn, setupSteps, type Reach, type Role, type SetupAnswers, type SetupPlace, type SetupStep } from './setupSteps';

/// Where a person is in setup, and what they answered (view 39, 19 Nov).
export interface SetupState {
  step: SetupStep;
  answers: SetupAnswers;
  /// "Here's your Karwan", as the server read it.
  lines: string[];
  /// 1 moving forward, -1 going back: which edge the next card enters from.
  direction: 1 | -1;
  /// Opened with "Change" from the summary: Next reads the answers again and
  /// returns there, Back returns without reading.
  fromSummary: boolean;
}

export type SetupEvent =
  | { type: 'role'; role: Role }
  | { type: 'line'; side: 'sell' | 'buy'; value: string }
  | { type: 'country'; country: string }
  | { type: 'place'; place: SetupPlace }
  | { type: 'reach'; reach: Reach | undefined }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'goto'; step: SetupStep }
  | { type: 'read'; lines: string[]; needs: Array<'price'> }
  | { type: 'edit' }
  | { type: 'resume'; answers: SetupAnswers; lines: string[] };

export function initialSetup(now: number, country: string): SetupState {
  return { step: 'role', answers: { startedAt: now, reach: 'both', place: { country } }, lines: [], direction: 1, fromSummary: false };
}

function move(state: SetupState, by: 1 | -1): SetupState {
  const steps = setupSteps();
  const at = steps.indexOf(state.step);
  return { ...state, step: steps[Math.min(Math.max(at + by, 0), steps.length - 1)]!, direction: by };
}

export function setupReducer(state: SetupState, event: SetupEvent): SetupState {
  const answers = state.answers;
  switch (event.type) {
    case 'role':
      return { ...state, answers: { ...answers, role: event.role } };
    case 'line':
      return { ...state, answers: { ...answers, [event.side === 'sell' ? 'sellLine' : 'buyLine']: event.value } };
    case 'country':
      return answers.place?.country === event.country ? state : { ...state, answers: { ...answers, place: { country: event.country } } };
    case 'place':
      return { ...state, answers: { ...answers, place: event.place } };
    case 'reach':
      return { ...state, answers: { ...answers, reach: event.reach } };
    case 'next':
      if (!canGoOn(state.step, answers)) return state;
      if (state.fromSummary) return { ...state, step: 'reading', direction: 1, fromSummary: false };
      return move(state, 1);
    case 'back':
      if (state.fromSummary) return { ...state, step: 'summary', direction: -1, fromSummary: false };
      return state.step === 'role' ? state : move(state, -1);
    case 'goto':
      return { ...state, step: event.step, direction: -1, fromSummary: state.step === 'summary' };
    case 'read':
      if (event.needs.includes('price')) return { ...state, step: 'role', direction: -1, answers: { ...answers, retried: true } };
      return { ...state, step: 'summary', lines: event.lines, direction: 1 };
    case 'edit':
      return { ...state, step: 'role', direction: -1, fromSummary: false };
    case 'resume':
      return { ...state, step: 'summary', answers: { ...answers, ...event.answers }, lines: event.lines, direction: 1 };
  }
}

/// The saved answers, for "Change" under Me: setup reopens on the summary
/// with everything the person said last time.
export function answersFromProfile(
  profile: Pick<UserProfile, 'goals' | 'ownWords' | 'settings' | 'location'> | null | undefined,
): SetupAnswers {
  if (!profile) return {};
  const goals = profile.goals ?? [];
  const words = profile.ownWords ?? {};
  const sells = goals.includes('work') || goals.includes('sell');
  const buys = goals.includes('buy');
  const out: SetupAnswers = {};
  if (sells || buys) out.role = sells && buys ? 'both' : sells ? 'sell' : 'buy';
  const sellLine = [words.what, words.price].filter((w) => w?.trim()).join(', ');
  if (sells && sellLine) out.sellLine = sellLine;
  if (buys && words.buy) out.buyLine = words.buy;
  const where = profile.location;
  if (where?.country) out.place = { country: where.country, ...(where.city ? { city: where.city } : {}) };
  if (profile.settings?.notifyVia) out.reach = profile.settings.notifyVia;
  return out;
}
