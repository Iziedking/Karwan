/// The exact fields another party may receive about a person. A response that
/// carries anything else is a leak, and the tests fail on it.

export const PASSPORT_KEYS = ['sealed', 'address', 'displayName', 'tag', 'tier', 'reasons', 'memberSince'] as const;

export function assertOnlyKeys(value: object, allowed: readonly string[]): void {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length > 0) throw new Error(`sealed view carries unexpected fields: ${extra.join(', ')}`);
}
