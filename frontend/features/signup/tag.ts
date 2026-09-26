/// Instant feedback for the tag field. The server (backend/src/profile/
/// karwanTag.ts) is the authority and also refuses reserved and taken tags;
/// this only mirrors the shape rules so typing feels immediate.

export type TagIssue = 'too_short' | 'too_long' | 'invalid' | 'reserved' | 'taken';

const SHAPE = /^[a-z](?:[a-z0-9]|_(?=[a-z0-9]))*$/;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

/// null when the field is empty or the shape is fine.
export function localTagIssue(raw: string): TagIssue | null {
  const tag = normalizeTag(raw);
  if (!tag) return null;
  if (tag.length < 3) return 'too_short';
  if (tag.length > 20) return 'too_long';
  if (!SHAPE.test(tag)) return 'invalid';
  return null;
}
