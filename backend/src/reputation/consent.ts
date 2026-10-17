/// Whether agents outside the Karwan market may read a person's record, and
/// whether their agent may look them up on platforms they connect. Both are off
/// until the person turns them on. Reads inside the market need no switch:
/// posting a request or an offer is the consent (see recordReadGate).

export const CONSENT_COPY_VERSION = 'reputation-2026-10-17';
const INTEREST_MAX = 280;

export interface ReputationSources {
  /// The retired in-market switch. Kept for old rows; it grants nothing now.
  recordReadable: boolean;
  outsideReadable: boolean;
  sourceLookup: boolean;
  /// Where else they built a reputation, in their words. Never scored, never
  /// shown to anyone else.
  interest: string;
  acceptedAt: number | null;
  copyVersion: string | null;
}

export const DEFAULT_SOURCES: ReputationSources = {
  recordReadable: false,
  outsideReadable: false,
  sourceLookup: false,
  interest: '',
  acceptedAt: null,
  copyVersion: null,
};

type WithSources = { reputationSources?: Partial<ReputationSources> } | null | undefined;

export function sourcesOf(profile: WithSources): ReputationSources {
  return { ...DEFAULT_SOURCES, ...(profile?.reputationSources ?? {}) };
}

export function mayReadOutside(profile: WithSources): boolean {
  return sourcesOf(profile).outsideReadable === true;
}

export function applySourcesUpdate(
  current: ReputationSources,
  patch: { outsideReadable?: boolean; sourceLookup?: boolean; interest?: string },
  now: number,
): ReputationSources {
  const next = { ...current };
  if (patch.outsideReadable !== undefined) next.outsideReadable = patch.outsideReadable;
  if (patch.sourceLookup !== undefined) next.sourceLookup = patch.sourceLookup;
  if (patch.interest !== undefined) next.interest = patch.interest.trim().slice(0, INTEREST_MAX);
  if (patch.outsideReadable !== undefined || patch.sourceLookup !== undefined) {
    next.acceptedAt = now;
    next.copyVersion = CONSENT_COPY_VERSION;
  }
  return next;
}
