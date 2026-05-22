/// Browser-side storage key + purge for the notification bell. Kept in a
/// dependency-free util so both the notifications hook and the auth/sign-out
/// path can clear it without a circular import (useNotifications imports useAuth,
/// so useAuth cannot import back from useNotifications).
export const NOTIFICATION_STORAGE_PREFIX = 'karwan:notifications:';

/// Remove persisted notifications from this browser. Pass an address to clear
/// just that account, or omit to clear every account's cache on this device.
/// Wired into sign-out and account deletion so a fresh sign-in (or a re-created
/// account on the same wallet) does not inherit the previous session's bell.
export function purgeStoredNotifications(address?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (address) {
      window.localStorage.removeItem(`${NOTIFICATION_STORAGE_PREFIX}${address.toLowerCase()}`);
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
