/// How a counterparty is named in a deal list: their Karwan tag, else their
/// display name while an older account has no tag, else nothing (the caller
/// falls back to a short address). Owner, 24 Oct 2026: the tag always leads.
export function partyLabel(profile: { displayName?: string | null; handle?: string | null } | null): string | null {
  const handle = profile?.handle?.trim().replace(/^@/, '');
  if (handle) return `@${handle}`;
  return profile?.displayName?.trim() || null;
}
