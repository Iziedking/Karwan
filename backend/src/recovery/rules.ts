/// Passkey recovery rules, kept free of storage and time so every limit can be
/// tested against a fixed clock.
const H = 60 * 60 * 1000;
export const RECOVERY_WAIT_MS = 48 * H;
export const RELEASED_TTL_MS = 24 * H;
export const REMINDER_LEAD_MS = H;
export const MAX_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 24 * H;

export type RequestState = 'waiting' | 'released' | 'completed' | 'cancelled' | 'expired';
export interface RecoveryRequest {
  id: string;
  walletAddress: string;
  state: RequestState;
  createdAt: number;
  releasableAt: number;
  releasedAt: number | null;
  completedAt: number | null;
  cancelledAt: number | null;
  reminderSentAt: number | null;
}

/// A released request can be opened again until it expires, so someone who
/// closed the tab before making the new passkey is not locked out; each open
/// still needs a fresh email code and the password to use.
export function canRelease(
  r: RecoveryRequest,
  now: number,
): { ok: true } | { ok: false; reason: 'not_waiting' | 'too_early' } {
  if (r.state === 'released') return shouldExpire(r, now) ? { ok: false, reason: 'not_waiting' } : { ok: true };
  if (r.state !== 'waiting') return { ok: false, reason: 'not_waiting' };
  if (now < r.releasableAt) return { ok: false, reason: 'too_early' };
  return { ok: true };
}

export const canCancel = (r: RecoveryRequest) => r.state === 'waiting' || r.state === 'released';

export const shouldExpire = (r: RecoveryRequest, now: number) =>
  r.state === 'released' && r.releasedAt !== null && now >= r.releasedAt + RELEASED_TTL_MS;

export const needsReminder = (r: RecoveryRequest, now: number) =>
  r.state === 'waiting' && r.reminderSentAt === null && now >= r.releasableAt - REMINDER_LEAD_MS;

/// Five failures inside any 24-hour span lock the wallet until 24 hours after
/// the fifth of them, even once the earlier ones have aged out.
export function attemptGate(failures: number[], now: number): { allowed: true } | { allowed: false; retryAt: number } {
  const sorted = [...failures].sort((a, b) => a - b);
  for (let i = MAX_ATTEMPTS - 1; i < sorted.length; i++) {
    const windowStart = sorted[i]! - ATTEMPT_WINDOW_MS;
    const inWindow = sorted.slice(0, i + 1).filter((t) => t > windowStart).length;
    const retryAt = sorted[i]! + ATTEMPT_WINDOW_MS;
    if (inWindow >= MAX_ATTEMPTS && now < retryAt) return { allowed: false, retryAt };
  }
  return { allowed: true };
}
