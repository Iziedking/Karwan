/// Who a tour is about to open for. Whether a tour has been seen is kept on the
/// device, so on a new phone a long-standing account looks like a first visit.
/// The account itself says otherwise: a deal, or a setup finished before today.
export const SETTLED_IN_MS = 24 * 60 * 60 * 1000;

export interface AccountFacts {
  /// How many deals the account is part of. Null until they have been read.
  deals: number | null;
  profileRead: boolean;
  setupDoneAt?: number;
}

export type Who = 'new' | 'known' | 'unknown';

export function whoIsThis(facts: AccountFacts, now: number): Who {
  if ((facts.deals ?? 0) > 0) return 'known';
  if (facts.profileRead && facts.setupDoneAt && now - facts.setupDoneAt > SETTLED_IN_MS) return 'known';
  if (facts.deals === null || !facts.profileRead) return 'unknown';
  return 'new';
}
