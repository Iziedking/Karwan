/// Whether agents may read a person's record, and whether their agent may look
/// them up on platforms they connect. Off until the person turns it on.

export const CONSENT_COPY_VERSION = 'reputation-2026-10-15';
const INTEREST_MAX = 280;

export interface ReputationSources {
  recordReadable: boolean;
  sourceLookup: boolean;
  /// Where else they built a reputation, in their words. Never scored, never
  /// shown to anyone else.
  interest: string;
  acceptedAt: number | null;
  copyVersion: string | null;
}

export const DEFAULT_SOURCES: ReputationSources = {
  recordReadable: false,
  sourceLookup: false,
  interest: '',
  acceptedAt: null,
  copyVersion: null,
};

type WithSources = { reputationSources?: Partial<ReputationSources> } | null | undefined;

export function sourcesOf(profile: WithSources): ReputationSources {
  return { ...DEFAULT_SOURCES, ...(profile?.reputationSources ?? {}) };
}

export function mayReadRecord(profile: WithSources): boolean {
  return sourcesOf(profile).recordReadable === true;
}

export function applySourcesUpdate(
  current: ReputationSources,
  patch: { recordReadable?: boolean; sourceLookup?: boolean; interest?: string },
  now: number,
): ReputationSources {
  const next = { ...current };
  if (patch.recordReadable !== undefined) next.recordReadable = patch.recordReadable;
  if (patch.sourceLookup !== undefined) next.sourceLookup = patch.sourceLookup;
  if (patch.interest !== undefined) next.interest = patch.interest.trim().slice(0, INTEREST_MAX);
  if (patch.recordReadable !== undefined || patch.sourceLookup !== undefined) {
    next.acceptedAt = now;
    next.copyVersion = CONSENT_COPY_VERSION;
  }
  return next;
}
