/// Karwan tags: the unique @handle every account picks at sign-up.
///
/// A tag is what a stranger sees and checks before trading, so it is unique
/// (case-insensitive, enforced by a Postgres unique index on the profile) and
/// cannot imitate Karwan or its partners. A tag is not a verification: it says
/// who you are on Karwan, never who you are in the world.

export type KarwanTagRejection = 'too_short' | 'too_long' | 'invalid' | 'reserved';
export type KarwanTagCheck = { ok: true; tag: string } | { ok: false; reason: KarwanTagRejection };

const MIN = 3;
const MAX = 20;
const SHAPE = /^[a-z](?:[a-z0-9]|_(?=[a-z0-9]))*$/;

/// Whole-word names, plus any tag that starts with one of these, so
/// "karwan_support" is refused as firmly as "karwan".
const RESERVED_PREFIXES = ['karwan', 'admin', 'support', 'official', 'circle', 'escrow', 'staff', 'moderator'];
const RESERVED_EXACT = new Set([
  'arc', 'usdc', 'eurc', 'help', 'team', 'security', 'system', 'root', 'api', 'app', 'account',
  'settings', 'wallet', 'payments', 'billing', 'legal', 'terms', 'privacy', 'mod', 'null', 'undefined',
]);

export function normalizeKarwanTag(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function checkKarwanTag(raw: string): KarwanTagCheck {
  const tag = normalizeKarwanTag(raw);
  if (tag.length < MIN) return { ok: false, reason: 'too_short' };
  if (tag.length > MAX) return { ok: false, reason: 'too_long' };
  if (!SHAPE.test(tag)) return { ok: false, reason: 'invalid' };
  if (RESERVED_EXACT.has(tag) || RESERVED_PREFIXES.some((p) => tag.startsWith(p))) {
    return { ok: false, reason: 'reserved' };
  }
  return { ok: true, tag };
}
