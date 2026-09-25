import { fromMicros, toMicros } from '@/features/money/usdc';
import type { CctpChainKey } from './config';
import type { BridgePhase } from './hooks/useBridge';

export type TopUpRoute = { kind: 'balance' } | { kind: 'pool' } | { kind: 'short'; shortfall: number };

/// Where an agent top-up draws from: the Arc balance when it covers the amount,
/// else a Gateway balance the account already holds. Never both: a split is two
/// movements, two receipts and two ways to half fail.
export function planTopUp(input: { amount: number; balance: number; pool: number }): TopUpRoute {
  const need = toMicros(input.amount);
  if (toMicros(input.balance) >= need) return { kind: 'balance' };
  if (toMicros(input.pool) >= need) return { kind: 'pool' };
  const best = Math.max(toMicros(input.balance), toMicros(input.pool));
  return { kind: 'short', shortfall: fromMicros(need - best) };
}

/// The destinations the backend Gateway cash-out accepts (api.gatewayCashOut).
export const POOL_DESTINATIONS: ReadonlySet<CctpChainKey> = new Set<CctpChainKey>([
  'baseSepolia',
  'arbitrumSepolia',
  'optimismSepolia',
  'sepolia',
  'polygonAmoy',
]);

export type OutRoute = { kind: 'pool' } | { kind: 'cctp' } | { kind: 'short'; shortfall: number };

/// Where a move or send off Arc draws from: the Gateway balance when it covers
/// the whole amount and reaches the destination, else the Arc balance. Never
/// both, and never a deposit into Gateway.
export function planOut(input: { amount: number; destination: CctpChainKey; balance: number; pool: number }): OutRoute {
  const need = toMicros(input.amount);
  const poolReaches = POOL_DESTINATIONS.has(input.destination);
  if (poolReaches && toMicros(input.pool) >= need) return { kind: 'pool' };
  if (toMicros(input.balance) >= need) return { kind: 'cctp' };
  const best = poolReaches ? Math.max(toMicros(input.balance), toMicros(input.pool)) : toMicros(input.balance);
  return { kind: 'short', shortfall: fromMicros(need - best) };
}

/// The most one move off Arc can take to this destination.
export function outAvailable(destination: CctpChainKey, balance: number, pool: number): number {
  return POOL_DESTINATIONS.has(destination) ? Math.max(balance, pool) : balance;
}

export type TransferStep = 'signed' | 'leaving' | 'arriving' | 'arrived';
export const TRANSFER_STEPS: TransferStep[] = ['signed', 'leaving', 'arriving', 'arrived'];

/// Where a transfer is, in the four steps the page shows. A wait maps to the
/// step it waits in, never to a failure: only the pipeline's own `error` does.
export function stepForPhase(phase: BridgePhase): TransferStep | 'failed' {
  switch (phase) {
    case 'switching':
    case 'approving':
    case 'burning':
      return 'signed';
    case 'relaying':
    case 'attesting':
      return 'leaving';
    case 'minting':
      return 'arriving';
    case 'done':
      return 'arrived';
    case 'error':
      return 'failed';
  }
}

/// A Gateway cash-out answers with its movement state rather than a phase. A
/// movement that needs attention is still waiting, not failed.
export function stepForMovementState(state: string): TransferStep | 'failed' {
  if (state === 'completed') return 'arrived';
  if (state === 'cancelled') return 'failed';
  if (state === 'submitted' || state === 'verifying' || state === 'needs_attention') return 'arriving';
  return 'signed';
}

export type Speed = 'seconds' | 'underMinute';

/// How long a route usually takes. No API reports this, so it comes from
/// Circle's published figures, read 2026-09-24: CCTP Fast Transfer attestation
/// about 8 seconds from most chains and about 20 from Ethereum, about half a
/// second from Arc (developers.circle.com/cctp/concepts/finality-and-block-
/// confirmations), rounded up to cover the mint on the other side; Gateway
/// transfers under 500 ms once a balance exists (developers.circle.com/gateway).
/// A transfer within Arc is final on inclusion (docs.arc.io, deterministic
/// finality).
export function routeSpeed(route: 'arc' | 'pool' | 'cctpIn' | 'cctpOut'): Speed {
  return route === 'arc' || route === 'pool' ? 'seconds' : 'underMinute';
}

/// Past this, the page says "Taking longer than usual. Nothing is lost."
export const LONGER_THAN_USUAL_MS: Record<Speed, number> = {
  seconds: 60_000,
  underMinute: 5 * 60_000,
};

export function isTakingLong(startedAt: number, now: number, speed: Speed): boolean {
  return now - startedAt > LONGER_THAN_USUAL_MS[speed];
}

/// Elapsed time as whole minutes and seconds.
export function elapsedParts(ms: number): { m: number; s: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { m: Math.floor(total / 60), s: total % 60 };
}

/// Chains where the connected wallet holds USDC, most first. `results` is one
/// multi-chain read in the same order as `keys`; a chain whose read failed is
/// left out rather than shown as empty. USDC has six decimals on every source.
export function walletSources<K extends string>(
  keys: readonly K[],
  results: ReadonlyArray<{ status: 'success' | 'failure'; result?: unknown } | undefined>,
): Array<{ key: K; amount: number }> {
  return keys
    .map((key, i) => {
      const read = results[i];
      const raw = read?.status === 'success' && typeof read.result === 'bigint' ? read.result : 0n;
      return { key, amount: Number(raw) / 1_000_000 };
    })
    .filter((source) => source.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export type TransferView =
  | { kind: 'moving'; step: TransferStep }
  | { kind: 'stuck' }
  | { kind: 'arrived' }
  | { kind: 'failed' };

/// What the progress view says. A pipeline error after the money left the
/// source is not a failure to the person: their USDC is on its way and a
/// recheck finishes it. Only an error before anything left is a failure.
export function transferView(step: TransferStep | 'failed', leftSource: boolean): TransferView {
  if (step === 'arrived') return { kind: 'arrived' };
  if (step === 'failed') return leftSource ? { kind: 'stuck' } : { kind: 'failed' };
  return { kind: 'moving', step };
}

/// A Gateway cash-out's answer, or its failure, as a step. A plain refusal (4xx
/// other than 409) moved nothing. A 409 means one is already in flight; a 5xx,
/// a named movement or no answer may have moved money, so it waits.
export function poolOutcome(
  answer: { movementState: string } | { status: number | null; reference: string | null },
): { step: TransferStep | 'failed'; leftSource: boolean } {
  if ('movementState' in answer) return { step: stepForMovementState(answer.movementState), leftSource: true };
  const refused = answer.status !== null && answer.status < 500 && answer.status !== 409 && !answer.reference;
  return { step: 'failed', leftSource: !refused };
}
