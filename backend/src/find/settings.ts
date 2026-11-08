import type { AgentPrefs, Meet, UserSettings } from '../db/profiles.js';

/// Who can be found and reached (view 72). Pure; read from the profile.

type FindProfile = { settings?: Pick<UserSettings, 'beFound' | 'meet' | 'contactFrom' | 'reachable'>; agentPrefs?: Pick<AgentPrefs, 'findClients'> };

/// Found only by choice. An answer of "Find clients for me" in setup is that
/// choice until they turn it off; an untouched default is not.
export function beFoundOf(p: FindProfile): boolean {
  return p.settings?.beFound ?? p.agentPrefs?.findClients === true;
}

export function reachableOf(p: FindProfile): boolean {
  return p.settings?.reachable === true;
}

export function contactFromOf(p: FindProfile): 'anyone' | 'verified' {
  return p.settings?.contactFrom ?? 'anyone';
}

export function meetOf(p: FindProfile): Meet {
  return p.settings?.meet ?? { atMyPlace: false, comeToYouKm: null, online: true };
}

export const COME_TO_YOU_MAX_KM = 100;

/// At least one way to meet, and a reach of 1 to 100 km when they travel.
export function validMeet(m: Meet): boolean {
  if (m.comeToYouKm !== null && (!Number.isFinite(m.comeToYouKm) || m.comeToYouKm < 1 || m.comeToYouKm > COME_TO_YOU_MAX_KM)) return false;
  return m.atMyPlace || m.online || m.comeToYouKm !== null;
}
