import type { AgentWallets } from '../db/agentWallets.js';
import type { Standing } from './rules.js';

/// Balance reads in USDC micros. Each throws when it cannot read.
export interface HoldingReaders {
  arc: (address: string) => Promise<bigint>;
  /// USDC on another chain Karwan's wallets sign on.
  chain: (chainKey: string, address: string) => Promise<bigint>;
  solana: (address: string) => Promise<bigint>;
  /// The unified balance of the account, and the x402 deposit.
  unified: (identity: string) => Promise<bigint>;
  gatewayDeposit: (depositor: string) => Promise<bigint>;
  stake: (identity: string) => Promise<bigint>;
}

type Wallet = { address: string };
const addressesOn = (byChain: Record<string, Wallet> | undefined, chain: string) => (byChain?.[chain] ? [byChain[chain]!.address] : []);

/// Every place a chat account can hold USDC that Karwan can move for it: its
/// wallets on Arc, the same wallets and the deposit wallets on each chain
/// Karwan signs on, Solana, the unified balance, the x402 deposit and the
/// stake. A read that fails is reported as null, never as zero.
export async function holdingsOf(
  identity: string,
  record: AgentWallets | null,
  chains: readonly { key: string; circleBlockchain: string }[],
  read: HoldingReaders,
): Promise<Standing['holdings']> {
  const jobs: { where: string; read: () => Promise<bigint> }[] = [];
  const add = (where: string, addresses: (string | undefined)[], fn: (a: string) => Promise<bigint>) => {
    for (const a of new Set(addresses.filter((x): x is string => !!x).map((x) => x.toLowerCase()))) {
      jobs.push({ where: `${where} ${a}`, read: () => fn(a) });
    }
  };

  add('arc', [identity, record?.buyerAddress, record?.sellerAddress, record?.x402Wallet?.address, record?.gatewayWallet?.address], read.arc);
  for (const { key, circleBlockchain: cb } of chains) {
    add(
      key,
      [
        identity,
        record?.buyerAddress,
        record?.sellerAddress,
        ...addressesOn(record?.bridgeWallets, cb),
        ...addressesOn(record?.buyerBridgeWallets, cb),
        ...addressesOn(record?.sellerBridgeWallets, cb),
        ...(record?.legacyBridgeWallets?.[cb] ?? []).map((w) => w.address),
      ],
      (a) => read.chain(key, a),
    );
  }
  const solana = Object.entries({ ...record?.bridgeWallets }).filter(([cb]) => cb.startsWith('SOL')).map(([, w]) => w.address);
  const solanaLegacy = Object.entries(record?.legacyBridgeWallets ?? {})
    .filter(([cb]) => cb.startsWith('SOL'))
    .flatMap(([, ws]) => ws.map((w) => w.address));
  // Solana addresses keep their case.
  for (const a of new Set([...solana, ...solanaLegacy])) jobs.push({ where: `solana ${a}`, read: () => read.solana(a) });
  jobs.push({ where: 'unified balance', read: () => read.unified(identity) });
  if (record?.x402Wallet) jobs.push({ where: 'x402 deposit', read: () => read.gatewayDeposit(record.x402Wallet!.address) });
  jobs.push({ where: 'stake', read: () => read.stake(identity) });

  return Promise.all(
    jobs.map(async (j) => {
      try {
        return { where: j.where, micros: await j.read() };
      } catch {
        return { where: j.where, micros: null };
      }
    }),
  );
}
