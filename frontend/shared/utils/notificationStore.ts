/// Browser-side storage key + purge for the notification bell. Kept in a
/// dependency-free util so both the notifications hook and the auth/sign-out
/// path can clear it without a circular import (useNotifications imports useAuth,
/// so useAuth cannot import back from useNotifications).
export const NOTIFICATION_STORAGE_PREFIX = 'karwan:notifications:';
// Read-state survives independently of the 30-item bell cache. The bell trims to
// the newest 30, so an older read notification can fall out of storage and then
// reappear (unread) on the next backfill from /api/activity. This set remembers
// which notification ids the user has read, so backfill paints them read again.
// The prefix nests under the notifications prefix so the wildcard purge below
// also clears it.
const READ_IDS_PREFIX = `${NOTIFICATION_STORAGE_PREFIX}read:`;
const MAX_READ_IDS = 500;

export function loadReadIds(address?: string | null): Set<string> {
  if (!address || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(`${READ_IDS_PREFIX}${address.toLowerCase()}`);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveReadIds(address: string | null | undefined, ids: Set<string>) {
  if (!address || typeof window === 'undefined') return;
  try {
    // Cap so the set can't grow without bound; keep the most recently added.
    const arr = Array.from(ids).slice(-MAX_READ_IDS);
    window.localStorage.setItem(`${READ_IDS_PREFIX}${address.toLowerCase()}`, JSON.stringify(arr));
  } catch {
    /* quota, ignore */
  }
}

/// Remove persisted notifications from this browser. Pass an address to clear
/// just that account, or omit to clear every account's cache on this device.
/// Wired into account deletion so a re-created account on the same wallet does
/// not inherit the previous session's bell. NOT wired into plain sign-out: the
/// cache is keyed per account, so a different account signing in won't see it,
/// and the same account that returns keeps its read/unread state.
export function purgeStoredNotifications(address?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (address) {
      const a = address.toLowerCase();
      window.localStorage.removeItem(`${NOTIFICATION_STORAGE_PREFIX}${a}`);
      window.localStorage.removeItem(`${READ_IDS_PREFIX}${a}`);
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(NOTIFICATION_STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
