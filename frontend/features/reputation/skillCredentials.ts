/// Rendering a verified skill credential.
///
/// Split out of CreditPassport so the two decisions in it, how a slug reads and
/// which date a chip shows, are testable rather than eyeballed on a page that
/// only fills in once someone completes a verification.

/// A skill id is a slug (`ui-design`, `smart_contracts`). Render it as words
/// rather than shipping a label map that would need an entry per skill and a
/// translation per locale for a set that grows on its own.
export function skillLabel(skillId: string): string {
  const words = skillId.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/// When it was verified, or when it renews if it has an end date. A reader
/// deciding whether to trust a credential deserves both facts, and the shorter
/// one belongs on the chip.
export function skillDateLabel(
  credential: { verifiedAt: number; expiresAt?: number },
  copy: { verifiedOn: string; expires: string },
): string {
  const format = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return credential.expiresAt !== undefined
    ? copy.expires.replace('{date}', format(credential.expiresAt))
    : copy.verifiedOn.replace('{date}', format(credential.verifiedAt));
}

