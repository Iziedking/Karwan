import type { UserProfile } from '@/core/api';

/// Which block Home puts first, from the setup answers (view 38).
export type HomeBlockKind = 'getPaid' | 'findWork' | 'postNeed' | 'setUp';

export function homeBlock(p: Partial<Pick<UserProfile, 'goals' | 'agentPrefs' | 'settings'>>): HomeBlockKind {
  if (!p.settings?.setupDoneAt) return 'setUp';
  const goals = p.goals ?? [];
  const selling = goals.includes('work') || goals.includes('sell');
  if (selling) return p.agentPrefs?.findClients === true ? 'findWork' : 'getPaid';
  if (goals.includes('buy')) return 'postNeed';
  return 'getPaid';
}
