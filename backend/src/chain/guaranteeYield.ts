import { parseAbi, type Address, type PublicClient } from 'viem';
import { guaranteeVaultAbi } from './guaranteeVault.js';

/// Yield on Deal guarantees (view 37, decision 3). The family vault holds no
/// yield route, so Karwan pays each guarantee the USYC rate through the yield
/// distributor, as it does for the previous vault. A guarantee earns on all
/// of it until collected, including what deals hold and what is coming back.

export interface GuaranteeHolder {
  /// The identity's own wallet; null when the registry has no controller.
  payee: Address | null;
  active: bigint;
}

export function guaranteeAccruals(holders: readonly GuaranteeHolder[], dailyBps: bigint): Map<Address, bigint> {
  const out = new Map<Address, bigint>();
  for (const h of holders) {
    if (!h.payee || h.active === 0n) continue;
    const accrual = (h.active * dailyBps) / 10_000n;
    if (accrual === 0n) continue;
    const key = h.payee.toLowerCase() as Address;
    out.set(key, (out.get(key) ?? 0n) + accrual);
  }
  return out;
}

export function mergeAccruals(...maps: ReadonlyMap<string, bigint>[]): Map<Address, bigint> {
  const out = new Map<Address, bigint>();
  for (const m of maps) {
    for (const [k, v] of m) {
      const key = k.toLowerCase() as Address;
      out.set(key, (out.get(key) ?? 0n) + v);
    }
  }
  return out;
}

const registryAbi = parseAbi([
  'function identityCount() view returns (uint64)',
  'function controllerOf(uint64 id) view returns (address)',
]);

const ZERO = '0x0000000000000000000000000000000000000000';

/// Every identity's guarantee, read straight from the vault. Identities are
/// numbered from 1, so walking them needs no event logs, whose wide windows
/// Arc can answer with nothing.
export async function readGuaranteeHolders(
  client: Pick<PublicClient, 'readContract'>,
  addrs: { registry: Address; vault: Address; usdc: Address },
): Promise<GuaranteeHolder[]> {
  const count = await client.readContract({ address: addrs.registry, abi: registryAbi, functionName: 'identityCount' });
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  return Promise.all(
    ids.map(async (id) => {
      const [stake, controller] = await Promise.all([
        client.readContract({ address: addrs.vault, abi: guaranteeVaultAbi, functionName: 'stakeOf', args: [id, addrs.usdc] }),
        client.readContract({ address: addrs.registry, abi: registryAbi, functionName: 'controllerOf', args: [id] }),
      ]);
      return { payee: controller === ZERO ? null : controller, active: stake.active };
    }),
  );
}
