import type { Meet, UserProfile } from '@/core/api';

/// Be found and be reached on the Your agent page (view 72). Pure; the same
/// rules as backend/src/find/settings.ts.

export const COME_TO_YOU_MAX_KM = 100;
export const DEFAULT_MEET: Meet = { atMyPlace: false, comeToYouKm: null, online: true };

type FindProfile = Pick<UserProfile, 'settings' | 'agentPrefs'>;

/// Found only by choice: setup's "Find clients for me" counts until they turn it off.
export function beFoundOf(p: FindProfile): boolean {
  return p.settings?.beFound ?? p.agentPrefs?.findClients === true;
}

export function reachableOf(p: FindProfile): boolean {
  return p.settings?.reachable === true;
}

export function meetOf(p: FindProfile): Meet {
  return p.settings?.meet ?? DEFAULT_MEET;
}

export function validMeet(m: Meet): boolean {
  if (m.comeToYouKm !== null && (!Number.isInteger(m.comeToYouKm) || m.comeToYouKm < 1 || m.comeToYouKm > COME_TO_YOU_MAX_KM)) return false;
  return m.atMyPlace || m.online || m.comeToYouKm !== null;
}

/// "at your shop, you go to people up to 10 km away, online", first letter as is.
export function meetLine(m: Meet, words: { atPlaceShort: string; goToShort: string; onlineShort: string }): string {
  return [
    ...(m.atMyPlace ? [words.atPlaceShort] : []),
    ...(m.comeToYouKm ? [words.goToShort.replace('{n}', String(m.comeToYouKm))] : []),
    ...(m.online ? [words.onlineShort] : []),
  ].join(', ');
}

/// The km stepper: 1, 2, 5, 10, 15, 20, 30, 50, 100.
export const KM_STEPS = [1, 2, 5, 10, 15, 20, 30, 50, 100] as const;
export function stepKm(km: number, up: boolean): number {
  const at = KM_STEPS.findIndex((s) => s >= km);
  const i = at < 0 ? KM_STEPS.length - 1 : at;
  const next = up ? Math.min(i + (KM_STEPS[i] === km ? 1 : 0), KM_STEPS.length - 1) : Math.max(i - 1, 0);
  return KM_STEPS[next]!;
}

export function contactFromOf(p: FindProfile): 'anyone' | 'verified' {
  return p.settings?.contactFrom ?? 'anyone';
}
