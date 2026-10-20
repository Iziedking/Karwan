import type { BriefAnswers } from '../agents/agentBriefLines.js';
import type { UserProfile } from '../db/profiles.js';

/// A setup change said in a conversation ("change my price to 25 to 45")
/// carries only what changed; the rest comes from what was saved.
export function mergeSetupAnswers(saved: UserProfile | null, change: Partial<BriefAnswers>): BriefAnswers {
  const words = saved?.ownWords ?? {};
  const base: BriefAnswers = { goals: saved?.goals ?? [] };
  if (words.what) base.what = words.what;
  if (words.price) base.price = words.price;
  if (words.buy) base.buy = words.buy;
  if (words.business) base.business = words.business;
  if (saved?.workPlaces) base.places = saved.workPlaces;
  if (saved?.agentPrefs?.findClients !== undefined) base.clients = saved.agentPrefs.findClients ? 'find' : 'own';
  if (saved?.agentPrefs?.agentMode) base.own = saved.agentPrefs.agentMode;
  if (saved?.settings?.notifyVia) base.reach = saved.settings.notifyVia;
  const merged: BriefAnswers = { ...base };
  for (const [key, value] of Object.entries(change)) {
    if (value !== undefined) (merged as unknown as Record<string, unknown>)[key] = value;
  }
  return merged;
}
