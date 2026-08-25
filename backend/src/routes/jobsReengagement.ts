import {
  buildUserRequestedReengagementInput,
  type BoundedReengagementInput,
} from '../negotiation/reengagement.js';

type JobsReengagementShadowObserver = (input: BoundedReengagementInput) => Promise<unknown>;

let reengagementShadowObserver: JobsReengagementShadowObserver | null = null;

/**
 * Optional read-only bridge from the existing buyer reconsideration action to
 * the durable shadow scheduler. The legacy near-miss re-raise remains the only
 * authority; this observer records a bounded user-triggered opportunity when
 * the negotiation shadow is explicitly enabled.
 */
export function configureJobsReengagementShadow(
  observer: JobsReengagementShadowObserver | null,
): () => void {
  reengagementShadowObserver = observer;
  return () => {
    if (reengagementShadowObserver === observer) reengagementShadowObserver = null;
  };
}

export async function enqueueLegacyReconsiderationShadow(
  source: Parameters<typeof buildUserRequestedReengagementInput>[0],
  nowUnix: number,
  observer: JobsReengagementShadowObserver | null = reengagementShadowObserver,
): Promise<boolean> {
  if (!observer) return false;
  const input = buildUserRequestedReengagementInput(source, nowUnix);
  if (!input) return false;
  await observer(input);
  return true;
}
