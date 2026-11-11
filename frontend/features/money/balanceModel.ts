import type { BridgePhase } from '@/features/bridge/hooks/useBridge';
import { toMicros } from './usdc';

export interface BalanceFacts {
  /// The sign-in wallet's USDC on Arc. Null until it loads.
  balance: number | null;
  /// A confirmed Gateway balance the account already holds; zero for most.
  pool: number;
  /// What sits in the buying and selling wallets; counted in the one balance (view 51, third round).
  agents?: number;
  loading: boolean;
  error: boolean;
}

export type HomeState = 'loading' | 'error' | 'empty' | 'ready';

export function homeState(facts: BalanceFacts): HomeState {
  if (facts.balance === null) return facts.error && !facts.loading ? 'error' : 'loading';
  return toMicros(facts.balance) + toMicros(facts.pool) + toMicros(facts.agents ?? 0) > 0 ? 'ready' : 'empty';
}

/// The one number: everything the person owns that is free to spend, each part
/// read on its own, then added (view 51, third round). Money held in deals is not in it.
export function heroAmount(facts: BalanceFacts): number {
  return (toMicros(facts.balance ?? 0) + toMicros(facts.pool) + toMicros(facts.agents ?? 0)) / 1e6;
}

export type BalancePart = 'ready' | 'transfer' | 'agent';

/// The parts of the one balance that hold money, for Where it is.
export function whereItIs(facts: BalanceFacts): Array<{ part: BalancePart; amount: number }> {
  const parts: Array<{ part: BalancePart; amount: number }> = [{ part: 'ready', amount: facts.balance ?? 0 }];
  if (facts.pool > 0) parts.push({ part: 'transfer', amount: facts.pool });
  if ((facts.agents ?? 0) > 0) parts.push({ part: 'agent', amount: facts.agents ?? 0 });
  return parts;
}

/// The two parts named under the one balance (view 77): what a send can use
/// now, and what is with the agents. In cents, rounded down, so the two never
/// add to more than the balance. Null when nothing is with the agents.
export function namedParts(facts: BalanceFacts): { ready: number; withAgents: number } | null {
  if (facts.balance === null) return null;
  const cents = (n: number) => Math.max(0, Math.floor(toMicros(n) / 10_000));
  const withAgents = cents(facts.agents ?? 0);
  if (withAgents === 0) return null;
  return { ready: Math.floor((toMicros(facts.balance) + toMicros(facts.pool)) / 10_000) / 100, withAgents: withAgents / 100 };
}

type MovingRecord = {
  phase: BridgePhase;
  direction?: 'in' | 'out';
  amountUsdc: string;
  sourceChainKey: string;
  startedAt: number;
};

/// A transfer older than this is not "on its way" any more in a person's eyes;
/// it lives in Transfer history, where it can be rechecked.
const MOVING_WINDOW_MS = 60 * 60_000;

/// The newest transfer still moving, for the line under the balance. A record
/// in error is not moving, same-chain sends finish before anyone reads it, and a
/// transfer stuck for over an hour does not claim the line.
export function movingTransfer<T extends MovingRecord>(records: readonly T[], now: number): T | null {
  return (
    records.find(
      (r) => r.phase !== 'done' && r.phase !== 'error' && r.sourceChainKey !== 'arc' && now - r.startedAt <= MOVING_WINDOW_MS,
    ) ?? null
  );
}

/// A balance to the cent, rounded down, so it never reads as more than it is.
export function formatBalance(value: number, locale: string): string {
  const cents = Math.floor(toMicros(value) / 10_000) / 100;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents);
}

/// An amount being moved, exactly as it will move: never rounded away.
export function formatAmount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value);
}
