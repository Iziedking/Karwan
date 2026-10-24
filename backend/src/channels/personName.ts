import { getProfile } from '../db/profiles.js';

type Named = { displayName?: string | null; handle?: string | null } | null | undefined;

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/// How a person is named in every message a person reads, on the website, in the
/// assistant and in each chat channel: their Karwan tag, which anyone can look
/// up; their display name while an older account has no tag yet; else the
/// fallback given.
export function personName(profile: Named, fallback: string): string {
  const handle = profile?.handle?.trim().replace(/^@/, '');
  if (handle) return `@${handle}`;
  return profile?.displayName?.trim() || fallback;
}

/// The same, looked up by wallet, with a short address as the last resort.
export async function personNameOf(address: string, fallback?: string): Promise<string> {
  const profile = await getProfile(address.toLowerCase()).catch(() => null);
  return personName(profile, fallback ?? shortAddress(address));
}

/// Names for several wallets at once, keyed by lower-case address.
export async function personNames(addresses: Iterable<string>): Promise<Map<string, string>> {
  const unique = [...new Set([...addresses].map((a) => a.toLowerCase()))];
  const names = await Promise.all(unique.map((a) => personNameOf(a)));
  return new Map(unique.map((a, i) => [a, names[i]!]));
}
