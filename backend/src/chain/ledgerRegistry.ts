import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import type { Address } from 'viem';
import { ARC, publicClient } from './client.js';
import { DEPLOY_LEDGER, type ContractKind } from './deployLedger.js';
import { db, pgEnabled } from '../db/client.js';
import { appSnapshots } from '../db/schema.js';
import { logger } from '../logger.js';

/// Every Karwan contract this network has ever run, so the all-time totals and
/// the public contract list never depend on someone remembering to regenerate a
/// file after a deploy.
///
/// Two sources, merged:
///  - the generated testnet history (deployLedger.ts), which only describes Arc
///    testnet and is ignored on any other network;
///  - contracts discovered at runtime: any address the running deployment is
///    configured with that the ledger does not know yet. Its deploy block is
///    found by binary search on the chain's code history, and it is persisted,
///    so when a newer version replaces it in the config it stays in the ledger
///    as a retired contract instead of vanishing from the history.

type Hex = `0x${string}`;
const TESTNET_CHAIN_ID = 5042002;

export interface LedgerEntry {
  name: string;
  kind: ContractKind;
  address: Hex;
  deployBlock: bigint;
  source: 'static' | 'discovered';
}

export interface ConfiguredContract {
  name: string;
  kind: ContractKind;
  address: string | undefined;
}

/// The first block at which `address` has code, or null when it has none at
/// head. At most ~log2(head) reads.
export async function findDeployBlock(
  address: Hex,
  head: bigint,
  hasCodeAt: (address: Hex, block: bigint) => Promise<boolean>,
): Promise<bigint | null> {
  if (!(await hasCodeAt(address, head))) return null;
  let lo = 0n;
  let hi = head;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (await hasCodeAt(address, mid)) hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

/// Static entries first, then discovered ones not already known, oldest first.
export function mergeLedger(statics: LedgerEntry[], discovered: LedgerEntry[]): LedgerEntry[] {
  const seen = new Set(statics.map((e) => e.address.toLowerCase()));
  const extra = discovered.filter((e) => {
    const key = e.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...statics, ...extra].sort((a, b) => (a.deployBlock < b.deployBlock ? -1 : a.deployBlock > b.deployBlock ? 1 : 0));
}

/// For each ledger address: live (configured now) or retired, and which version
/// of its contract name it is, counted by deploy order.
export function retirement(
  ledger: LedgerEntry[],
  configured: string[],
): Map<string, { status: 'live' | 'retired'; version: number; of: number }> {
  const live = new Set(configured.map((a) => a.toLowerCase()));
  const byName = new Map<string, LedgerEntry[]>();
  for (const e of ledger) byName.set(e.name, [...(byName.get(e.name) ?? []), e]);
  const out = new Map<string, { status: 'live' | 'retired'; version: number; of: number }>();
  for (const entries of byName.values()) {
    const ordered = [...entries].sort((a, b) => (a.deployBlock < b.deployBlock ? -1 : 1));
    ordered.forEach((e, i) => {
      out.set(e.address.toLowerCase(), {
        status: live.has(e.address.toLowerCase()) ? 'live' : 'retired',
        version: i + 1,
        of: ordered.length,
      });
    });
  }
  return out;
}

// ------------------------------- live state --------------------------------

const STORE_PATH =
  process.env.LEDGER_DISCOVERED_PATH ?? resolve(process.cwd(), 'data', `ledgerDiscovered-${ARC.chainId}.json`);
const SNAPSHOT_KEY = `ledger_discovered_${ARC.chainId}`;

interface StoredEntry {
  name: string;
  kind: ContractKind;
  address: Hex;
  deployBlock: string;
}

function staticEntries(): LedgerEntry[] {
  if (ARC.chainId !== TESTNET_CHAIN_ID) return [];
  return DEPLOY_LEDGER.map((c) => ({ ...c, address: c.address as Hex, source: 'static' as const }));
}

let discovered: LedgerEntry[] = [];
let loaded = false;

function fromStored(rows: StoredEntry[]): LedgerEntry[] {
  return rows.map((r) => ({ ...r, deployBlock: BigInt(r.deployBlock), source: 'discovered' as const }));
}

async function load(): Promise<void> {
  if (loaded) return;
  try {
    if (existsSync(STORE_PATH)) discovered = fromStored(JSON.parse(readFileSync(STORE_PATH, 'utf8')) as StoredEntry[]);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'ledger: discovered list unreadable on disk');
  }
  if (discovered.length === 0 && pgEnabled) {
    try {
      const rows = await db().select().from(appSnapshots).where(eq(appSnapshots.key, SNAPSHOT_KEY));
      const data = rows[0]?.data as StoredEntry[] | undefined;
      if (Array.isArray(data)) discovered = fromStored(data);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'ledger: discovered list unreadable in postgres');
    }
  }
  loaded = true;
}

function save(): void {
  const rows: StoredEntry[] = discovered.map((e) => ({
    name: e.name,
    kind: e.kind,
    address: e.address,
    deployBlock: e.deployBlock.toString(),
  }));
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(rows), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'ledger: could not persist discovered contracts to disk');
  }
  if (pgEnabled) {
    const now = Date.now();
    void db()
      .insert(appSnapshots)
      .values({ key: SNAPSHOT_KEY, data: rows, updatedAt: now })
      .onConflictDoUpdate({ target: appSnapshots.key, set: { data: rows, updatedAt: now } })
      .catch(() => undefined);
  }
}

/// The full ledger for this network: generated history plus everything ever
/// discovered.
export async function currentLedger(): Promise<LedgerEntry[]> {
  await load();
  return mergeLedger(staticEntries(), discovered);
}

/// Add any configured contract the ledger does not know yet. Returns the new
/// entries, so the caller can catch their history up.
export async function discoverConfigured(configured: ConfiguredContract[]): Promise<LedgerEntry[]> {
  await load();
  const known = new Set((await currentLedger()).map((e) => e.address.toLowerCase()));
  const candidates = configured.filter(
    (c): c is ConfiguredContract & { address: string } =>
      !!c.address && /^0x[0-9a-fA-F]{40}$/.test(c.address) && !known.has(c.address.toLowerCase()),
  );
  if (candidates.length === 0) return [];
  const head = await publicClient.getBlockNumber();
  const hasCodeAt = async (address: Hex, block: bigint) =>
    ((await publicClient.getCode({ address: address as Address, blockNumber: block })) ?? '0x') !== '0x';
  const added: LedgerEntry[] = [];
  for (const c of candidates) {
    const address = c.address.toLowerCase() as Hex;
    const deployBlock = await findDeployBlock(address, head, hasCodeAt);
    if (deployBlock === null) {
      logger.warn({ name: c.name, address }, 'ledger: configured contract has no code on this network, skipped');
      continue;
    }
    const entry: LedgerEntry = { name: c.name, kind: c.kind, address, deployBlock, source: 'discovered' };
    discovered.push(entry);
    added.push(entry);
    logger.info({ name: c.name, address, deployBlock: deployBlock.toString() }, 'ledger: discovered a new contract');
  }
  if (added.length > 0) save();
  return added;
}

export function __resetLedgerForTest(entries: LedgerEntry[] = []): void {
  discovered = entries;
  loaded = true;
}
