import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { bridges } from './schema.js';
import type { CctpChainKey } from '../chain/cctpChains.js';
import type { AppKitSourceChainKey } from '../circle/bridge-kit.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'bridges.json');

// 'approving' and 'burning' are the source-side stages of the Circle-user
// bridge, where the backend signs the burn from a per-user source-chain DCW.
// 'relaying' onward is shared with the web3 path (burn already on chain, now
// polling IRIS + minting on Arc). Terminal: 'minted', 'error'.
export type BridgeStatus = 'approving' | 'burning' | 'relaying' | 'minted' | 'error';

export interface BridgeRelay {
  bridgeId: string;
  sourceDomain: number;
  /// Empty until the burn lands. The web3 path supplies it up front; the
  /// Circle path fills it once the backend-signed depositForBurn confirms.
  sourceTxHash: string;
  amountUsdc: string;
  mintRecipient: string;
  status: BridgeStatus;
  mintTxHash?: string;
  error?: string;
  /// Bridge direction. 'in' = another chain -> Arc (mint on Arc, the default and
  /// legacy behaviour). 'out' = Arc -> another chain (burn on Arc, mint on the
  /// destination). Absent is treated as 'in'.
  direction?: 'in' | 'out';
  /// For 'out' bridges: the destination chain the mint lands on. A CCTP EVM key,
  /// or 'solanaDevnet' (Solana is an App Kit forwarder destination, not a CCTP
  /// source key, so it is added explicitly).
  destChainKey?: CctpChainKey | 'solanaDevnet';
  /// The session identity that created this bridge. For an 'in' bridge this
  /// equals `mintRecipient` (the user's own Arc address), but for an 'out'
  /// bridge `mintRecipient` is the destination-chain recipient, so ownership
  /// checks (recheck / status / resume) must read this field, not
  /// `mintRecipient`. Absent on records created before this field landed; those
  /// fall back to `mintRecipient`, which is correct for 'in' and the pre-fix
  /// stuck case for 'out'.
  owner?: string;
  // --- Circle-user source-side pipeline state (resume across restarts) ---
  /// Which source chain the burn happened on.
  ///
  /// Widened to CctpChainKey because CCTP now also covers Avalanche, Unichain,
  /// Sei, Sonic, World Chain and HyperEVM. Those are web3-only (no Circle wallet
  /// can execute a contract there), so a record on one of them never carries a
  /// DCW, but it is still a real bridge we must persist and relay. App Kit
  /// bridges can additionally be 'solanaDevnet'; `appKit: true` below marks
  /// those so the hand-rolled resume logic skips them.
  sourceChainKey?: CctpChainKey | AppKitSourceChainKey;
  /// True when this bridge is managed by the App Kit + Forwarding Service
  /// path (POST /circle-bridge-app-kit). The hand-rolled resume logic
  /// (resumePendingBridges → startSourcePipeline) skips these because App
  /// Kit's kit.bridge() does not currently checkpoint resumable state across
  /// process restarts. A future iteration can persist the BridgeResult and
  /// call kit.retry() on boot.
  appKit?: boolean;
  /// The user's source-chain Circle DCW that signs approve + burn.
  bridgeWalletId?: string;
  bridgeWalletAddress?: string;
  /// Circle transaction ids for the in-flight approve / burn, so a restart can
  /// re-poll them instead of re-submitting (which would double up userOps).
  approveTxId?: string;
  burnTxId?: string;
  /// UUID v4 idempotency keys generated at createBridge time and reused on every
  /// submitContractCall for approve / burn. Closes the small gap between Circle
  /// accepting a submit and our process persisting the txId: if our process
  /// dies in that window, retry sends the same key and Circle dedupes instead
  /// of accepting a second submission. Absent on bridges created before this
  /// field landed. Those fall back to the SDK's per-call auto-generated key.
  approveIdempotencyKey?: string;
  burnIdempotencyKey?: string;
  createdAt: number;
  updatedAt: number;
}

// Shared short-TTL cache for the full-table read. The boot resume sync, the
// per-user bridge history modal, and the bridge status poll all scan every row;
// during an active relay the poll fires often. Cache the full set once and
// derive the three list views from it. Busted on createBridge / patchBridge so
// a status transition (e.g. relaying -> minted) is never served stale. Per-id
// reads (getBridge) stay live. Set BRIDGES_CACHE_TTL_MS=0 to disable.
const BRIDGES_CACHE_TTL_MS = Number(process.env.BRIDGES_CACHE_TTL_MS ?? 30_000);
let allBridgesCache: { at: number; rows: BridgeRelay[] } | null = null;

function invalidateBridgesCache(): void {
  allBridgesCache = null;
}

async function loadAllBridges(): Promise<BridgeRelay[]> {
  const now = Date.now();
  if (BRIDGES_CACHE_TTL_MS > 0 && allBridgesCache && now - allBridgesCache.at < BRIDGES_CACHE_TTL_MS) {
    return allBridgesCache.rows;
  }
  const rows = pgEnabled
    ? (await db().select().from(bridges)).map((r) => r.data)
    : Object.values(loadFile());
  if (BRIDGES_CACHE_TTL_MS > 0) allBridgesCache = { at: now, rows };
  return rows;
}

export async function getBridge(bridgeId: string): Promise<BridgeRelay | null> {
  if (pgEnabled) {
    const rows = await db().select().from(bridges).where(eq(bridges.bridgeId, bridgeId));
    return rows[0]?.data ?? null;
  }
  return loadFile()[bridgeId] ?? null;
}

export async function createBridge(
  input: Omit<BridgeRelay, 'status' | 'createdAt' | 'updatedAt'> & { status?: BridgeStatus },
): Promise<BridgeRelay> {
  // A replayed create (retry, double-click, recheck re-POST) must never
  // regress a bridge that already MINTED: resetting it to approving/relaying
  // re-enters the pipeline, and on the Circle source path that can re-run
  // approve + burn — a double spend. Terminal records win over any create.
  // Non-terminal existing records (error, stuck relaying) may be overwritten:
  // that is exactly how a recheck re-arms them.
  const existing = await getBridge(input.bridgeId);
  if (existing && existing.status === 'minted') return existing;

  const now = Date.now();
  const { status, ...rest } = input;
  const record: BridgeRelay = {
    ...rest,
    // Web3 bridges arrive already burned, so they default straight to
    // 'relaying'. Circle bridges pass 'approving' to enter the source pipeline.
    status: status ?? 'relaying',
    // Preserve the original start time across a re-arm so history ordering
    // and elapsed displays stay truthful.
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (pgEnabled) {
    await db()
      .insert(bridges)
      .values({ bridgeId: record.bridgeId, data: record })
      .onConflictDoUpdate({ target: bridges.bridgeId, set: { data: record } });
    invalidateBridgesCache();
    return record;
  }
  const store = loadFile();
  store[record.bridgeId] = record;
  saveFile(store);
  invalidateBridgesCache();
  return record;
}

export async function patchBridge(
  bridgeId: string,
  patch: Partial<BridgeRelay>,
): Promise<BridgeRelay | null> {
  const existing = await getBridge(bridgeId);
  if (!existing) return null;
  const next: BridgeRelay = { ...existing, ...patch, updatedAt: Date.now() };
  if (pgEnabled) {
    await db().update(bridges).set({ data: next }).where(eq(bridges.bridgeId, bridgeId));
    invalidateBridgesCache();
    return next;
  }
  const store = loadFile();
  store[bridgeId] = next;
  saveFile(store);
  invalidateBridgesCache();
  return next;
}

/// Bridges in any non-terminal state. Used to resume after a backend restart:
/// 'approving'/'burning' resume the Circle source pipeline, 'relaying' resumes
/// the IRIS-poll + Arc mint. Terminal states ('minted', 'error') are skipped.
export async function listPendingBridges(): Promise<BridgeRelay[]> {
  const isPending = (b: BridgeRelay) => b.status !== 'minted' && b.status !== 'error';
  return (await loadAllBridges()).filter(isPending);
}

/// Bridge records belonging to one user. Newest first.
///
/// Ownership is decided in a strict order, because addresses are NOT a safe
/// identity key here. Circle derives wallet addresses from a per-chain index
/// counter in the shared wallet set, so the same address can legitimately be
/// handed to DIFFERENT users on DIFFERENT chains — an audit of live data found
/// one user's Base deposit wallet sitting at another user's Arc identity
/// address. Matching any record whose `bridgeWalletAddress` appeared in a set
/// that included the caller's own identity therefore leaked one user's bridge
/// history to another.
///
///   1. `owner` set (every bridge-OUT): authoritative, must equal the caller.
///   2. otherwise `mintRecipient`: a bridge-IN always mints to the caller's own
///      Arc address, so this identifies the owner without touching addresses
///      that can collide.
///   3. otherwise the signing wallet, but ONLY against the caller's own
///      provisioned source DCWs — never their identity address, which is the
///      collision surface.
export async function listBridgesForUser(input: {
  /// The caller's verified session address.
  owner: string;
  /// The caller's own deposit DCWs, keyed by chain: `{ [sourceChainKey]:
  /// address }`. Keyed rather than a flat list so step 3 can require the CHAIN
  /// to match too — an address alone is not unique across chains.
  sourceWalletsByChain: Record<string, string>;
}): Promise<BridgeRelay[]> {
  const owner = input.owner.toLowerCase();
  const byChain = new Map(
    Object.entries(input.sourceWalletsByChain).map(([chain, a]) => [chain, a.toLowerCase()]),
  );
  const all = await loadAllBridges();
  return all
    .filter((b) => {
      if (b.owner) return b.owner.toLowerCase() === owner;
      if (b.mintRecipient && b.mintRecipient.toLowerCase() === owner) return true;
      // Address AND chain must both match. Comparing the address alone would
      // still admit another user's deposit wallet that happens to share this
      // address on a different chain.
      if (!b.bridgeWalletAddress || !b.sourceChainKey) return false;
      return byChain.get(b.sourceChainKey) === b.bridgeWalletAddress.toLowerCase();
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/// All bridge records across every wallet. Used by the bus synthesis on
/// boot to inject `bridge.minted` events for any completed bridge that
/// isn't already in the bus history, keeps the /activity counter aligned
/// with what the per-user bridge history modal already shows.
export async function listAllBridges(): Promise<BridgeRelay[]> {
  // Copy before sorting: loadAllBridges returns the cached array by reference.
  return (await loadAllBridges()).slice().sort((a, b) => b.createdAt - a.createdAt);
}

// --- flat-file fallback ---

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, BridgeRelay> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, BridgeRelay>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, BridgeRelay>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
