/// A backend Solana wallet pays its own network fee and the rent for its USDC
/// token account, in SOL. A fresh wallet holds none, so moving a deposit out
/// of it failed at the burn with the money stuck where it landed. Before a
/// move this tops the wallet up from the testnet faucet and waits for it.

import { MIN_SOLANA_GAS_LAMPORTS, readSolanaLamports } from '../chain/solanaBalances.js';
import { dripTestnetUsdc, SOL_DEVNET_BLOCKCHAIN } from './wallets.js';

export interface SolanaGasDeps {
  readLamports: (address: string) => Promise<number | null>;
  drip: (address: string) => Promise<{ ok: boolean }>;
  sleep: (ms: number) => Promise<void>;
  minLamports: number;
  attempts: number;
}

const defaults: SolanaGasDeps = {
  readLamports: readSolanaLamports,
  drip: (address) => dripTestnetUsdc(address, { blockchain: SOL_DEVNET_BLOCKCHAIN, native: true, usdc: false }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  minLamports: MIN_SOLANA_GAS_LAMPORTS,
  attempts: 12,
};

/// True once `address` holds enough SOL to move USDC out.
export async function ensureSolanaGas(address: string, overrides: Partial<SolanaGasDeps> = {}): Promise<boolean> {
  const d = { ...defaults, ...overrides };
  const enough = async () => ((await d.readLamports(address)) ?? 0) >= d.minLamports;
  if (await enough()) return true;
  if (!(await d.drip(address)).ok) return false;
  for (let i = 0; i < d.attempts; i += 1) {
    await d.sleep(5_000);
    if (await enough()) return true;
  }
  return false;
}
