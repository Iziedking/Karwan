import { durableEphemeralMap } from './ephemeral.js';

/// Mainnet desk code attempts (view 79), kept by each network in its own
/// database: five wrong codes lock that email on this network for 15 minutes,
/// and a code's step is remembered so the same code never works twice.

export const CODE_LOCK_MS = 15 * 60_000;
const MAX_WRONG_CODES = 5;
const STEP_KEPT_MS = 5 * 60_000;

interface Wrong { count: number; lockedUntil?: number; expiresAt: number }
interface Used { step: number; expiresAt: number }

const wrongCodes = durableEphemeralMap<Wrong>('desk-code-wrong');
const usedSteps = durableEphemeralMap<Used>('desk-code-step');

export function codeLockedUntil(email: string, now: number): number | null {
  const w = wrongCodes.get(email.toLowerCase());
  return w?.lockedUntil && w.lockedUntil > now ? w.lockedUntil : null;
}

export function lastCodeStep(memberId: string, now: number): number | undefined {
  const u = usedSteps.get(memberId);
  return u && u.expiresAt > now ? u.step : undefined;
}

export function recordCode(email: string, memberId: string, ok: boolean, step: number | null, now: number): { locked: boolean } {
  const key = email.toLowerCase();
  if (ok) {
    wrongCodes.delete(key);
    if (step !== null) usedSteps.set(memberId, { step, expiresAt: now + STEP_KEPT_MS });
    return { locked: false };
  }
  const before = wrongCodes.get(key);
  const live = before && before.expiresAt > now && !(before.lockedUntil && before.lockedUntil <= now) ? before : undefined;
  const count = (live?.count ?? 0) + 1;
  if (count >= MAX_WRONG_CODES) {
    wrongCodes.set(key, { count, lockedUntil: now + CODE_LOCK_MS, expiresAt: now + CODE_LOCK_MS });
    return { locked: true };
  }
  wrongCodes.set(key, { count, expiresAt: now + CODE_LOCK_MS });
  return { locked: false };
}
