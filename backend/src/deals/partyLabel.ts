/// How a counterparty is named in a deal list: their display name, else their
/// Karwan tag, else nothing (the caller falls back to a short address).
export function partyLabel(profile: { displayName?: string | null; handle?: string | null } | null): string | null {
  const name = profile?.displayName?.trim();
  if (name) return name;
  const handle = profile?.handle?.trim().replace(/^@/, '');
  return handle ? `@${handle}` : null;
}
