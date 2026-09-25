import { planTopUp } from '@/features/bridge/routePlan';

export type StartKind = 'request' | 'offer';
export type StartStep = 'setup' | 'move' | 'post';
export type StartPlan =
  | { kind: 'loading' }
  | { kind: 'needsProfile' }
  | { kind: 'needsMoney'; shortfall: number }
  | { kind: 'ready'; steps: StartStep[]; moveUsdc: number | null; source: 'balance' | 'pool' | null };

/// What the first press will do, decided before the press so the sheet can
/// state it: set up the agents once, move the exact shortfall to the buyer
/// agent, then post. Unknown facts wait; nothing is guessed.
export function startPlan(facts: {
  kind: StartKind;
  activated: boolean | null;
  hasRoleProfile: boolean | null;
  topUpNeededUsdc: number | null;
  balance: number | null;
  pool: number | null;
}): StartPlan {
  if (facts.activated === null || facts.hasRoleProfile === null) return { kind: 'loading' };
  if (!facts.hasRoleProfile) return { kind: 'needsProfile' };
  const setup: StartStep[] = facts.activated ? [] : ['setup'];
  if (facts.kind === 'offer') return { kind: 'ready', steps: [...setup, 'post'], moveUsdc: null, source: null };
  if (facts.topUpNeededUsdc === null) return { kind: 'loading' };
  if (facts.topUpNeededUsdc <= 0) return { kind: 'ready', steps: [...setup, 'post'], moveUsdc: null, source: null };
  if (facts.balance === null) return { kind: 'loading' };
  const route = planTopUp({ amount: facts.topUpNeededUsdc, balance: facts.balance, pool: facts.pool ?? 0 });
  if (route.kind === 'short') return { kind: 'needsMoney', shortfall: route.shortfall };
  return { kind: 'ready', steps: [...setup, 'move', 'post'], moveUsdc: facts.topUpNeededUsdc, source: route.kind };
}
