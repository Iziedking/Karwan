const COMMON = ['password', '12345678', 'qwerty', 'letmein', 'welcome', 'karwan', 'iloveyou', 'admin', 'abc123'];

/// Twelve characters, not built on a well-known password, not one repeated
/// character. Length does most of the work: a passphrase is easier to remember
/// and harder to guess than a short string of symbols.
export function passwordStrength(pw: string): { ok: boolean; reason: 'short' | 'common' | 'repeated' | null } {
  if (pw.length < 12) return { ok: false, reason: 'short' };
  if (new Set(pw).size <= 2) return { ok: false, reason: 'repeated' };
  const lower = pw.toLowerCase();
  if (COMMON.some((c) => lower.includes(c))) return { ok: false, reason: 'common' };
  return { ok: true, reason: null };
}
