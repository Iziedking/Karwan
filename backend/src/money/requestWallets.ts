/// A payment link's own receiving addresses, so a payer can send USDC from an
/// exchange or any wallet and the payment is tied to the request by address
/// rather than by guessing from the amount.
///
/// These are new Circle wallets, and creating a Circle wallet takes the next
/// index from its wallet set. Two creates running at once can be handed the
/// same index and the same address, which is how the platform once ended up
/// with one deposit address under two owners. So the wallets live in a wallet
/// set of their own, creates run one at a time, the other EVM chains are
/// derived from the first wallet (a pure function, no index), and an address
/// that already belongs to anyone is refused before it is ever shown.

import type { ReceivingWallets } from './depositRequests.js';

export interface WalletProvider {
  create(input: { blockchain: string; accountType: 'SCA' | 'EOA'; refId: string }): Promise<{ id: string; address: string }>;
  derive(input: { walletId: string; blockchain: string; refId: string }): Promise<{ id: string; address: string }>;
}

export interface ProvisionDeps {
  provider: WalletProvider;
  /// Circle codes, first one created, the rest derived from it.
  evmChains: string[];
  solanaChain: string | null;
  /// True when `${blockchain}:${address}` already belongs to an account or another request.
  isKnownAddress: (blockchain: string, address: string) => Promise<boolean>;
}

let queue: Promise<unknown> = Promise.resolve();
const inFlight = new Map<string, Promise<ReceivingWallets>>();

/// Runs one at a time across every request in this process.
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

export function provisionRequestWallets(token: string, deps: ProvisionDeps): Promise<ReceivingWallets> {
  const existing = inFlight.get(token);
  if (existing) return existing;
  const job = serial(() => provision(token, deps)).finally(() => inFlight.delete(token));
  inFlight.set(token, job);
  return job;
}

async function provision(token: string, deps: ProvisionDeps): Promise<ReceivingWallets> {
  const refId = `request:${token}`;
  const [first, ...rest] = deps.evmChains;
  if (!first) throw new Error('no EVM chain to receive on');

  const anchor = await deps.provider.create({ blockchain: first, accountType: 'SCA', refId });
  await refuseKnown(deps, first, anchor.address);
  const wallets: Record<string, string> = { [first]: anchor.id };
  for (const blockchain of rest) {
    const derived = await deps.provider.derive({ walletId: anchor.id, blockchain, refId });
    if (derived.address.toLowerCase() !== anchor.address.toLowerCase()) {
      throw new Error(`derived address on ${blockchain} differs from the request address`);
    }
    await refuseKnown(deps, blockchain, derived.address);
    wallets[blockchain] = derived.id;
  }

  let solana: ReceivingWallets['solana'] = null;
  if (deps.solanaChain) {
    const sol = await deps.provider.create({ blockchain: deps.solanaChain, accountType: 'EOA', refId });
    await refuseKnown(deps, deps.solanaChain, sol.address);
    solana = { address: sol.address, walletId: sol.id };
  }
  return { evm: { address: anchor.address.toLowerCase(), wallets }, solana };
}

async function refuseKnown(deps: ProvisionDeps, blockchain: string, address: string): Promise<void> {
  if (await deps.isKnownAddress(blockchain, address)) {
    throw new Error(`receiving address on ${blockchain} is already in use; not using it`);
  }
}
