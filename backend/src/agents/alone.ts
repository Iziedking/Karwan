import { agentPrefsOf, type UserProfile } from '../db/profiles.js';
import type { AgentRecord } from './agentRecord.js';

/// What a person's agent may do alone, one switch each (view 87). A profile
/// saved before the switches reads them from the older three-way mode, so its
/// agent does what it did before.

export const AGENT_SWITCHES = ['offers', 'bargain', 'agree', 'lock', 'find', 'data', 'brief'] as const;
export type AgentSwitch = (typeof AGENT_SWITCHES)[number];
/// The brief is switched in the agent record, where its hour already lives.
export type SavedSwitch = Exclude<AgentSwitch, 'brief'>;
export type Alone = Record<AgentSwitch, boolean>;
export type AgentMode = 'offers' | 'ask' | 'agree';

const SAVED: readonly SavedSwitch[] = ['offers', 'bargain', 'agree', 'lock', 'find', 'data'];

type Profile = Pick<UserProfile, 'agentPrefs'> | null | undefined;
type Record_ = Pick<AgentRecord, 'brief' | 'stopped'> | null | undefined;

/// "Ask me first" paid for no research, so data follows the mode until saved.
export function switchesOfMode(mode: AgentMode): Alone {
  const acts = mode !== 'ask';
  return { offers: acts, bargain: acts, agree: mode === 'agree', lock: false, find: true, data: acts, brief: true };
}

/// The switches as the person set them, whether or not the agent is running.
export function switchesOf(profile: Profile, record?: Record_): Alone {
  const out = switchesOfMode(agentPrefsOf(profile).agentMode);
  const saved = profile?.agentPrefs?.alone ?? {};
  for (const name of SAVED) {
    const value = saved[name];
    if (typeof value === 'boolean') out[name] = value;
  }
  out.brief = record?.brief?.on !== false;
  return out;
}

/// What the agent may do alone right now: nothing while it is switched off
/// (view 75) or has stopped itself.
export function aloneOf(profile: Profile, record?: Record_): Alone {
  const on = agentPrefsOf(profile).agentOn !== false && !record?.stopped;
  const switches = switchesOf(profile, record);
  if (on) return switches;
  return { offers: false, bargain: false, agree: false, lock: false, find: false, data: false, brief: false };
}

type Prefs = NonNullable<UserProfile['agentPrefs']>;

/// Lock money stands on Agree a price: with that off there is no price to lock.
function settled(switches: Alone): Alone {
  return switches.agree ? switches : { ...switches, lock: false };
}

function savedOf(switches: Alone): Record<SavedSwitch, boolean> {
  return Object.fromEntries(SAVED.map((name) => [name, switches[name]])) as Record<SavedSwitch, boolean>;
}

/// The prefs after one switch is set. Every switch is saved as it stood, so the
/// older mode kept beside them can never change one the person did not touch.
export function prefsWithSwitch(prefs: Prefs | undefined, name: SavedSwitch, on: boolean): Prefs {
  const base = prefs ?? {};
  const next = settled({ ...switchesOf({ agentPrefs: base }), [name]: on });
  return { ...base, alone: savedOf(next), agentMode: modeOf(next) };
}

/// The prefs after the older three-way mode is set. Once switches are saved the
/// mode moves the four it always covered, or the saved ones would win over it.
export function prefsWithMode(prefs: Prefs | undefined, mode: AgentMode): Prefs {
  const base = prefs ?? {};
  if (!base.alone || Object.keys(base.alone).length === 0) return { ...base, agentMode: mode };
  const { offers, bargain, agree, data } = switchesOfMode(mode);
  const next = settled({ ...switchesOf({ agentPrefs: base }), offers, bargain, agree, data });
  return { ...base, alone: savedOf(next), agentMode: mode };
}

/// A seller built without switches, as older callers and fixtures do, is on Make offers.
export function sellerSwitches(seller: { alone?: Alone }): Alone {
  return seller.alone ?? switchesOfMode('offers');
}

/// The older mode a set of switches reads as, for the places that still save it.
export function modeOf(alone: Pick<Alone, 'offers' | 'agree'>): AgentMode {
  if (alone.agree) return 'agree';
  return alone.offers ? 'offers' : 'ask';
}
