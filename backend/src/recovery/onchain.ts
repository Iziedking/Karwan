import type { Hex } from 'viem';
import { publicClient } from '../chain/client.js';

/// A signature made by the wallet with the recovery key as its owner verifies
/// (ERC-1271) only once that key is an owner on-chain. That is the proof that
/// recovery is switched on; Circle's address mapping alone is off-chain.
/// Proven on Arc mainnet on 2026-09-27 (audit/RECOVERY_SPIKE_2026-09-27.md).
export async function isRecoveryOwner(wallet: Hex, message: string, signature: Hex): Promise<boolean> {
  try {
    return await publicClient.verifyMessage({ address: wallet, message, signature });
  } catch {
    return false;
  }
}
