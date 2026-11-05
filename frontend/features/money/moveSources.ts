import type { CctpChainKey } from '@/features/bridge/config';

/// Where money can come from in the one money sheet (view 51). Pure, so the
/// order and the rules are tested without a browser.
export type MoveSource =
  | { kind: 'network'; chain: CctpChainKey; amount: number }
  | { kind: 'pool'; amount: number }
  | { kind: 'balance'; amount: number }
  | { kind: 'exchange' };

export interface AddInput {
  /// A web3 wallet account owns a Transfer balance; email and passkey accounts never do (view 23).
  account: 'wallet' | 'email';
  walletConnected: boolean;
  networks: ReadonlyArray<{ key: CctpChainKey; amount: number }>;
  pool: number;
}

/// Add money: the wallet's networks that hold USDC, richest first, then the
/// Transfer balance (wallet accounts only), then the exchange address.
export function addSources(input: AddInput): MoveSource[] {
  const networks: MoveSource[] = input.walletConnected
    ? [...input.networks]
        .filter((n) => n.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .map((n) => ({ kind: 'network' as const, chain: n.key, amount: n.amount }))
    : [];
  const pool: MoveSource[] = input.account === 'wallet' && input.pool > 0 ? [{ kind: 'pool', amount: input.pool }] : [];
  return [...networks, ...pool, { kind: 'exchange' }];
}

/// Topping up an agent: the balance first (it moves instantly), then the
/// Transfer balance and the wallet's networks as for Add money.
export function topUpSources(input: AddInput & { balance: number }): MoveSource[] {
  const rest = addSources(input).filter((s) => s.kind !== 'exchange');
  const balance: MoveSource[] = input.balance > 0 ? [{ kind: 'balance', amount: input.balance }] : [];
  return [...balance, ...rest.filter((s) => s.kind === 'pool'), ...rest.filter((s) => s.kind === 'network')];
}

/// Networks where a Gateway deposit is final within seconds, from Circle's
/// published table (logged in docs/arc-circle-checks.md, 5 Nov 2026). The
/// rest (Ethereum and the OP Stack and Arbitrum rollups) take 13 to 19 minutes.
const FAST_FINALITY: ReadonlySet<string> = new Set(['arc', 'avalancheFuji', 'polygonAmoy', 'sonicTestnet', 'seiTestnet', 'hyperevmTestnet']);

export function readyIn(chain: string): 'seconds' | 'about15Minutes' {
  return FAST_FINALITY.has(chain) ? 'seconds' : 'about15Minutes';
}

/// How long a top-up from a network takes to reach Arc with CCTP Fast:
/// about 8 seconds from the rollups and Solana, about 20 from Ethereum.
export function arrivesIn(chain: string): 'seconds' | 'twentySeconds' {
  return chain === 'sepolia' ? 'twentySeconds' : 'seconds';
}
