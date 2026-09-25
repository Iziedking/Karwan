import type { BridgePhase } from '@/features/bridge/hooks/useBridge';
import { toMicros } from './usdc';

export interface BalanceFacts {
  /// The sign-in wallet's USDC on Arc. Null until it loads.
  balance: number | null;
  /// A confirmed Gateway balance the account already holds; zero for most.
  pool: number;
  loading: boolean;
  error: boolean;
}

export type HomeState = 'loading' | 'error' | 'empty' | 'ready';

export function homeState(facts: BalanceFacts): HomeState {
  if (facts.balance === null) return facts.error && !facts.loading ? 'error' : 'loading';
  return toMicros(facts.balance) + toMicros(facts.pool) > 0 ? 'ready' : 'empty';
}

/// The one number: what the account can spend without first bringing money in.
export function heroAmount(facts: BalanceFacts): number {
  return (facts.balance ?? 0) + facts.pool;
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
