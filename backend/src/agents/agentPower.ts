import { agentPrefsOf, getProfile, type UserProfile } from '../db/profiles.js';

/// The agent switch (view 75). Off stops what the agent does on its own:
/// offers, bargaining and recommending, finding people, watches, paid research,
/// the brief and its notes. Running deals, money and the assistant go on.

export function agentOnOf(profile: Pick<UserProfile, 'agentPrefs'> | null | undefined): boolean {
  return agentPrefsOf(profile).agentOn !== false;
}

/// A profile that cannot be read counts as on: nothing stops by accident.
export async function agentIsOn(owner: string): Promise<boolean> {
  const profile = await getProfile(owner.toLowerCase()).catch(() => null);
  return agentOnOf(profile);
}

/// What an assistant tool answers when the person asks for something only the
/// agent does while it is off. The assistant itself still does what it is told.
export const AGENT_OFF_ANSWER = {
  agentOff: true,
  next: 'Their agent is switched off, so it does not find people, watch the market or pay for research. Say so in one line and offer to turn it back on (propose_change_mandate, part power, on true). Posting a request, offering by hand, deals and money still work.',
} as const;

/// The switch is open only where a chosen seller is asked and the buyer picks
/// from a shortlist. On the older path the buyer's agent picks the seller
/// itself, so there is nothing for a person to run by hand.
export function agentSwitchOpen(flags: { sellerAsked: boolean; shortlist: boolean }): boolean {
  return flags.sellerAsked && flags.shortlist;
}
