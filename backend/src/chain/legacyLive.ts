import { encodeFunctionData, type Address, type Hex } from 'viem';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ARC, publicClient } from './client.js';
import { readUsdcBalance } from './contracts.js';
import { DEPLOY_LEDGER } from './deployLedger.js';
import {
  LEGACY_STATE,
  dealStepCalls,
  dealSteps,
  decodeLegacyEscrow,
  escrowVersionForWidth,
  legacyEscrowAbi,
  legacyVaultAbi,
  olderContracts,
  olderContractsForAdmin,
  olderContractTotals,
  vaultStepCall,
  vaultSteps,
  type Call,
  type EscrowVersion,
  type LegacyDeal,
  type OlderContractRow,
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

/// The money contracts still in use. Older ones are everything else in the ledger.
function liveAddresses(): string[] {
  const c = config as unknown as Record<string, string | undefined>;
  return Object.keys(c)
    .filter((k) => /^KARWAN_.*_ADDR$/.test(k) && !k.includes('LEGACY'))
    .map((k) => c[k])
    .filter((v): v is string => !!v && /^0x[0-9a-fA-F]{40}$/.test(v));
}

const REPORT_TTL_MS = 5 * 60_000;
let report: { at: number; rows: Promise<OlderContractRow[]> } | null = null;

/// The admin table of older contracts (view 37): what each holds, how much of
/// it open deals and positions on Karwan's records hold for people, and the
/// part with no step that goes through today. Read from the chain, cached a few
/// minutes because it simulates every open step.
export function olderContractsReport(jobIds: () => Promise<string[]>): Promise<OlderContractRow[]> {
  if (report && Date.now() - report.at < REPORT_TTL_MS) return report.rows;
  const rows = (async () => {
    const contracts = ON_LEDGER_NETWORK ? olderContractsForAdmin(DEPLOY_LEDGER, { escrow: config.KARWAN_ESCROW_ADDR ?? null, others: liveAddresses() }) : [];
    const balances = new Map<Address, bigint>();
    await Promise.all(
      contracts.map(async (c) => {
        const b = await readUsdcBalance(c.address).catch(() => null);
        if (b !== null) balances.set(c.address, b);
      }),
    );
    const now = Math.floor(Date.now() / 1000);
    const held: Array<{ contract: Address; micros: bigint; hasStep: boolean }> = [];
    const anyStep = async (from: Address, calls: Call[]) => (await Promise.all(calls.map((call) => simulates(from, call)))).some(Boolean);

    for (const vault of contracts.filter((c) => c.reader === 'vault')) {
      const positions = await vaultIndex(vault.address).catch(() => [] as LegacyVaultPosition[]);
      for (const p of positions) {
        const calls = vaultSteps(p, now).map((s) => vaultStepCall(p.vault, s, p.positionId));
        held.push({ contract: vault.address, micros: p.principalMicros, hasStep: await anyStep(p.owner, calls) });
      }
    }

    const ids = await jobIds();
    for (const [escrow, version] of await escrowVersions()) {
      for (let i = 0; i < ids.length; i += 25) {
        const reads = await Promise.all(
          ids.slice(i, i + 25).map(async (jobId) => {
            const r = await publicClient.call({ to: escrow, data: encodeFunctionData({ abi: legacyEscrowAbi, functionName: 'escrows', args: [jobId as Hex] }) }).catch(() => null);
            const deal = r?.data ? decodeLegacyEscrow(version, r.data) : null;
            return deal ? { jobId, deal } : null;
          }),
        );
        for (const hit of reads) {
          if (!hit || hit.deal.lockedMicros === 0n) continue;
          if (hit.deal.state !== LEGACY_STATE.Funded && hit.deal.state !== LEGACY_STATE.Disputed) continue;
          const calls = dealSteps(hit.deal, 'buyer').map((s) => dealStepCalls(escrow, s, hit.jobId as Hex, hit.deal)[0]!);
          held.push({ contract: escrow, micros: hit.deal.lockedMicros, hasStep: await anyStep(hit.deal.buyer, calls) });
        }
      }
    }
    return olderContractTotals({ contracts, balances, held });
  })();
  rows.catch(() => {
    report = null;
  });
  report = { at: Date.now(), rows };
  return rows;
}
