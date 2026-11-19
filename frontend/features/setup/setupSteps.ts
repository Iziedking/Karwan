/// Set up in two minutes (docs/architecture/39-start-to-home.md, 19 Nov):
/// sell, buy or both with one line each, then where you are and how we reach
/// you, then the summary. The Telegram interview in
/// backend/src/channels/interview.ts asks the same, in the same order.

export type Goal = 'work' | 'sell' | 'buy' | 'business' | 'record';
export type Role = 'sell' | 'buy' | 'both';
export type Reach = 'telegram' | 'email' | 'both';

export type SetupStep = 'role' | 'where' | 'reading' | 'summary';

export interface SetupPlace {
  /// ISO 3166-1 alpha-2.
  country: string;
  city?: string;
  admin?: string;
  /// From "Use my location"; the server keeps it to about a kilometre.
  point?: { lat: number; lng: number };
}

export interface SetupAnswers {
  role?: Role;
  sellLine?: string;
  buyLine?: string;
  place?: SetupPlace;
  reach?: Reach;
  /// When the questions opened, so the time setup takes can be watched.
  startedAt?: number;
  retried?: boolean;
}

/// What setup offers to post next: the words handed to the assistant, which
/// shows the card (backend/src/agents/firstPost.ts).
export type SetupFirstPost = { kind: 'offer' | 'request'; handOff: string };

const filled = (v: string | undefined) => (v?.trim().length ?? 0) >= 2;
export const sells = (a: SetupAnswers) => a.role === 'sell' || a.role === 'both';
export const buys = (a: SetupAnswers) => a.role === 'buy' || a.role === 'both';

export function setupSteps(): SetupStep[] {
  return ['role', 'where', 'reading', 'summary'];
}

/// Whether Next can be pressed on a question.
export function canGoOn(step: SetupStep, a: SetupAnswers): boolean {
  if (step === 'role') return !!a.role && (!sells(a) || filled(a.sellLine)) && (!buys(a) || filled(a.buyLine));
  if (step === 'where') return !!a.place?.country && filled(a.place.city) && !!a.reach;
  return true;
}

export function firstPostKind(a: SetupAnswers): 'offer' | 'request' | null {
  return sells(a) ? 'offer' : buys(a) ? 'request' : null;
}

/// A step with Back and Next under it.
export const isQuestionStep = (step: SetupStep) => step !== 'reading' && step !== 'summary';

/// How far through "About you" the person is, from 0 to 1, for the bar on /start.
export function aboutProgress(steps: readonly SetupStep[], current: SetupStep): number {
  if (current === 'summary') return 1;
  const asked: SetupStep[] = steps.filter((s) => isQuestionStep(s));
  const at = asked.indexOf(current);
  if (current === 'reading') return asked.length / (asked.length + 1);
  return at < 0 ? 0 : at / (asked.length + 1);
}
