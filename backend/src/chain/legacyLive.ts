import { encodeFunctionData, type Address, type Hex } from 'viem';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ARC, publicClient } from './client.js';
import { DEPLOY_LEDGER } from './deployLedger.js';
import {
  decodeLegacyEscrow,
  escrowVersionForWidth,
  legacyEscrowAbi,
  legacyVaultAbi,
  olderContracts,
  type Call,
  type EscrowVersion,
  type LegacyDeal,
} from './legacyContracts.js';

/// Live reads behind the legacy page (view 37). The deploy ledger lists Arc
/// Testnet; on any other network there are no older contracts to read.
const ON_LEDGER_NETWORK = ARC.testnet;

export function olderContractsHere() {
  return ON_LEDGER_NETWORK ? olderContracts(DEPLOY_LEDGER, { escrow: config.KARWAN_ESCROW_ADDR ?? null }) : { escrows: [], vaults: [] };
}

const ZERO_JOB = `0x${'00'.repeat(32)}` as Hex;
let versions: Promise<Map<Address, EscrowVersion>> | null = null;

/// Each older escrow's version, read once from the width of its deal record.
/// An escrow whose record cannot be read (the v2 escrow keeps its deals
/// elsewhere) is left out.
export function escrowVersions(): Promise<Map<Address, EscrowVersion>> {
  versions ??= (async () => {
    const out = new Map<Address, EscrowVersion>();
    await Promise.all(
      olderContractsHere().escrows.map(async (escrow) => {
        try {
          const r = await publicClient.call({ to: escrow, data: encodeFunctionData({ abi: legacyEscrowAbi, functionName: 'escrows', args: [ZERO_JOB] }) });
          const version = r.data ? escrowVersionForWidth((r.data.length - 2) / 64) : null;
          if (version) out.set(escrow, version);
        } catch {
          // not an escrow with this getter
        }
      }),
    );
    return out;
  })().catch((err) => {
    versions = null;
    throw err;
  });
  return versions;
}

export async function findLegacyDeal(jobId: string): Promise<{ escrow: Address; version: EscrowVersion; deal: LegacyDeal } | null> {
  const map = await escrowVersions();
  for (const [escrow, version] of map) {
    try {
      const r = await publicClient.call({ to: escrow, data: encodeFunctionData({ abi: legacyEscrowAbi, functionName: 'escrows', args: [jobId as Hex] }) });
      const deal = r.data ? decodeLegacyEscrow(version, r.data) : null;
      if (deal) return { escrow, version, deal };
    } catch (err) {
      logger.warn({ escrow, jobId, err: (err as Error).message }, 'legacy escrow read failed');
    }
  }
  return null;
}

export interface LegacyVaultPosition {
  vault: Address;
  positionId: bigint;
  owner: Address;
  principalMicros: bigint;
  claimableAt: number;
  state: number;
}

const INDEX_TTL_MS = 60_000;
const index = new Map<Address, { at: number; rows: Promise<LegacyVaultPosition[]> }>();

/// Every open position on one vault. Older vaults only shrink, so a short cache
/// is enough; a step clears the vault's entry.
function vaultIndex(vault: Address): Promise<LegacyVaultPosition[]> {
  const hit = index.get(vault);
  if (hit && Date.now() - hit.at < INDEX_TTL_MS) return hit.rows;
  const rows = (async () => {
    const next = await publicClient.readContract({ address: vault, abi: legacyVaultAbi, functionName: 'nextPositionId' });
    const ids = Array.from({ length: Number(next) + 1 }, (_, i) => BigInt(i));
    const reads = await Promise.allSettled(ids.map((id) => publicClient.readContract({ address: vault, abi: legacyVaultAbi, functionName: 'positions', args: [id] })));
    const out: LegacyVaultPosition[] = [];
    reads.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const [owner, principal, , , claimableAt, state] = r.value;
      if ((state === 1 || state === 2) && principal > 0n) {
        out.push({ vault, positionId: ids[i]!, owner: owner.toLowerCase() as Address, principalMicros: principal, claimableAt: Number(claimableAt), state });
      }
    });
    return out;
  })();
  rows.catch(() => index.delete(vault));
  index.set(vault, { at: Date.now(), rows });
  return rows;
}

export function forgetVaultIndex(vault: Address): void {
  index.delete(vault.toLowerCase() as Address);
}

export async function vaultPositionsFor(owners: readonly string[]): Promise<LegacyVaultPosition[]> {
  const wanted = new Set(owners.map((o) => o.toLowerCase()));
  const all = await Promise.all(
    olderContractsHere().vaults.map((v) =>
      vaultIndex(v).catch((err) => {
        logger.warn({ vault: v, err: (err as Error).message }, 'legacy vault read failed');
        return [] as LegacyVaultPosition[];
      }),
    ),
  );
  return all.flat().filter((p) => wanted.has(p.owner));
}

/// Whether the first call of a step would go through from this wallet now.
export async function simulates(from: Address, call: Call): Promise<boolean> {
  try {
    await publicClient.call({ account: from, to: call.to, data: call.data });
    return true;
  } catch {
    return false;
  }
}
