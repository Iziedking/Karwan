/// Money a contract keeps for someone because a payout to them failed (view
/// 66). The suite's deal escrows and its guarantee vault keep it per asset;
/// the CRE fees contract keeps it in USDC only. Only the owed address can
/// collect it, by calling `withdrawOwed` itself.

export type OwedContract = 'agreement' | 'jobs' | 'time' | 'vault' | 'cre';

export interface OwedSource {
  contract: OwedContract;
  address: string;
  /// `owed(asset, who)` and `withdrawOwed(asset)`, or `owed(who)` and `withdrawOwed()`.
  perAsset: boolean;
}

export interface OwedWallet {
  address: string;
  /// The Circle wallet Karwan signs with, or null for the person's own wallet.
  walletId: string | null;
}

export interface OwedLine {
  id: string;
  contract: OwedContract;
  contractAddress: string;
  wallet: string;
  walletId: string | null;
  perAsset: boolean;
  amountMicros: bigint;
}

type Addr = string | null | undefined;

export function owedSources(addrs: Partial<Record<OwedContract, Addr>>): OwedSource[] {
  const order: OwedContract[] = ['agreement', 'jobs', 'time', 'vault', 'cre'];
  return order.flatMap((contract) => {
    const address = addrs[contract];
    return address ? [{ contract, address: address.toLowerCase(), perAsset: contract !== 'cre' }] : [];
  });
}

interface AgentWalletsLike {
  buyerAddress?: string;
  buyerWalletId?: string;
  sellerAddress?: string;
  sellerWalletId?: string;
  x402Wallet?: { address: string; walletId: string };
  gatewayWallet?: { address: string; walletId: string };
}

/// Every address of a person a payout can land on: their account and their agents' wallets.
export function personWallets(input: { address: string; identityWalletId: string | null; agents: AgentWalletsLike | null }): OwedWallet[] {
  const out: OwedWallet[] = [];
  const add = (address: string | undefined, walletId: string | null | undefined) => {
    if (!address) return;
    const key = address.toLowerCase();
    if (out.some((w) => w.address === key)) return;
    out.push({ address: key, walletId: walletId ?? null });
  };
  const a = input.agents;
  add(input.address, input.identityWalletId);
  add(a?.buyerAddress, a?.buyerWalletId);
  add(a?.sellerAddress, a?.sellerWalletId);
  add(a?.x402Wallet?.address, a?.x402Wallet?.walletId);
  add(a?.gatewayWallet?.address, a?.gatewayWallet?.walletId);
  return out;
}

export const owedLineId = (contract: OwedContract, wallet: string) => `${contract}:${wallet.toLowerCase()}`;

export async function readOwedLines(
  sources: readonly OwedSource[],
  wallets: readonly OwedWallet[],
  read: (source: OwedSource, wallet: OwedWallet) => Promise<bigint>,
): Promise<{ lines: OwedLine[]; totalMicros: bigint; unread: number }> {
  const jobs = sources.flatMap((source) => wallets.map((wallet) => ({ source, wallet })));
  const results = await Promise.allSettled(jobs.map(({ source, wallet }) => read(source, wallet)));
  const lines: OwedLine[] = [];
  let unread = 0;
  results.forEach((r, i) => {
    const { source, wallet } = jobs[i]!;
    if (r.status === 'rejected') {
      unread++;
      return;
    }
    if (r.value <= 0n) return;
    lines.push({
      id: owedLineId(source.contract, wallet.address),
      contract: source.contract,
      contractAddress: source.address,
      wallet: wallet.address,
      walletId: wallet.walletId,
      perAsset: source.perAsset,
      amountMicros: r.value,
    });
  });
  return { lines, totalMicros: lines.reduce((sum, l) => sum + l.amountMicros, 0n), unread };
}

export function withdrawOwedCall(source: Pick<OwedSource, 'perAsset'>, usdc: string): { signature: string; params: string[] } {
  return source.perAsset ? { signature: 'withdrawOwed(address)', params: [usdc] } : { signature: 'withdrawOwed()', params: [] };
}

export const owedOperationKey = (lineId: string, requestId: string) => `owed:${lineId}:${requestId}`;

const eq = (a: string | null | undefined, b: string) => (a ?? '').toLowerCase() === b.toLowerCase();

export function proveOwedWithdrawal(input: {
  status: 'success' | 'reverted';
  /// From `receiptParties`, which names the smart account for a user operation.
  receiptFrom: string | null | undefined;
  contractAddress: string;
  wallet: string;
  usdc: string;
  amountMicros: bigint;
  withdrawn: readonly { emitter: string; to?: string; amount?: bigint }[];
  transfers: readonly { tokenAddress: string; from?: string; to?: string; value?: bigint }[];
}): void {
  if (input.status !== 'success') throw new Error('owed withdrawal reverted');
  if (!eq(input.receiptFrom, input.wallet)) throw new Error('owed withdrawal sender is not the owed wallet');
  const event = input.withdrawn.filter((e) => eq(e.emitter, input.contractAddress) && eq(e.to, input.wallet) && e.amount === input.amountMicros);
  if (event.length !== 1) throw new Error('owed withdrawal has no matching OwedWithdrawn event');
  const paid = input.transfers.filter(
    (t) => eq(t.tokenAddress, input.usdc) && eq(t.from, input.contractAddress) && eq(t.to, input.wallet) && t.value === input.amountMicros,
  );
  if (paid.length !== 1) throw new Error('owed withdrawal has no exact USDC payment to the owed wallet');
}

// ---------------------------------------------------------------- the support scan

/// Arc's `eth_getLogs` refuses more than 10,000 blocks (docs, rpc-endpoints).
const SCAN_STEP = 9_999n;
const SCAN_STEPS_PER_PASS = 50;
/// The first scan reaches back 30 days at about 2 blocks a second.
const FIRST_SCAN_BLOCKS = 5_200_000n;

export interface OwedAddress {
  contract: OwedSource['contract'];
  contractAddress: string;
  wallet: string;
  firstSeenAt: number;
}

export const owedAddressKey = (contract: string, wallet: string) => `${contract}:${wallet.toLowerCase()}`;

export interface OwedScanIo {
  getLogs: (source: OwedSource, fromBlock: bigint, toBlock: bigint) => Promise<Array<{ to?: string }>>;
  cursor: (contract: OwedSource['contract']) => Promise<bigint | null>;
  saveCursor: (contract: OwedSource['contract'], block: bigint) => Promise<void>;
  known: (key: string) => Promise<boolean>;
  remember: (key: string, entry: OwedAddress) => Promise<void>;
  now: () => number;
}

/// One contract's `PayoutCredited` logs since the last pass, in 9,999-block steps.
export async function scanOwedSource(source: OwedSource, head: bigint, io: OwedScanIo): Promise<number> {
  const saved = await io.cursor(source.contract);
  let from = saved !== null ? saved + 1n : head > FIRST_SCAN_BLOCKS ? head - FIRST_SCAN_BLOCKS : 0n;
  let found = 0;
  for (let step = 0; step < SCAN_STEPS_PER_PASS && from <= head; step++) {
    const to = from + SCAN_STEP - 1n > head ? head : from + SCAN_STEP - 1n;
    for (const log of await io.getLogs(source, from, to)) {
      if (!log.to) continue;
      const key = owedAddressKey(source.contract, log.to);
      if (await io.known(key)) continue;
      await io.remember(key, { contract: source.contract, contractAddress: source.address, wallet: log.to.toLowerCase(), firstSeenAt: io.now() });
      found++;
    }
    await io.saveCursor(source.contract, to);
    from = to + 1n;
  }
  return found;
}
