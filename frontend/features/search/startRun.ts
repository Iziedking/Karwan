import type { StartPlan, StartStep } from './startPlan';

export type StepStatus = 'waiting' | 'running' | 'slow' | 'done' | 'failed';
export interface RunState {
  steps: Array<{ step: StartStep; status: StepStatus }>;
  createdId: string | null;
}

export function initRun(steps: StartStep[]): RunState {
  return { steps: steps.map((step) => ({ step, status: 'waiting' })), createdId: null };
}

/// A done step stays done: that is what keeps a late answer from posting twice.
export function setStep(state: RunState, step: StartStep, status: StepStatus, createdId?: string): RunState {
  return {
    steps: state.steps.map((s) => (s.step === step && s.status !== 'done' ? { step, status } : s)),
    createdId: createdId ?? state.createdId,
  };
}

/// The next step to start, only once every step before it is done.
export function nextStep(state: RunState): StartStep | null {
  for (const s of state.steps) {
    if (s.status === 'done') continue;
    return s.status === 'waiting' ? s.step : null;
  }
  return null;
}

export function runBusy(state: RunState): boolean {
  return state.steps.some((s) => s.status === 'running' || s.status === 'slow');
}

export function runFinished(state: RunState): boolean {
  return state.steps.every((s) => s.status === 'done');
}

/// How a post that threw ends. A 4xx is a refusal and the backend's
/// "postJob reverted" is a definite on-chain failure (it deletes the brief);
/// anything else cannot say whether the post landed, so it waits.
export function postOutcome(err: { status: number; message: string } | null): 'failed' | 'slow' {
  if (!err) return 'slow';
  if (err.status >= 400 && err.status < 500) return 'failed';
  if (err.message === 'postJob reverted') return 'failed';
  return 'slow';
}

/// The sheet may close while a step waits; the run stays and reopens. It may
/// not close while a step is mid-flight.
export function runClosable(state: RunState): boolean {
  return !state.steps.some((s) => s.status === 'running');
}

export type SheetMode = 'loading' | 'needsProfile' | 'needsMoney' | 'begin' | 'running' | 'checkAgain' | 'tryAgain' | 'done';

/// What the sheet's action area shows. Once a run exists it owns the sheet:
/// a live plan recomputed after the move landed must not replace the run's
/// own controls with a false shortfall.
export function sheetMode(plan: StartPlan, run: RunState | null): SheetMode {
  if (run) {
    if (run.steps.some((s) => s.status === 'running')) return 'running';
    if (run.steps.some((s) => s.status === 'slow')) return 'checkAgain';
    if (run.steps.some((s) => s.status === 'failed')) return 'tryAgain';
    return runFinished(run) ? 'done' : 'running';
  }
  if (plan.kind === 'ready') return 'begin';
  return plan.kind;
}
