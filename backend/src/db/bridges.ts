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
  /// For 'out' bridges: the destination CCTP chain the mint lands on.
  destChainKey?: CctpChainKey;
  // --- Circle-user source-side pipeline state (resume across restarts) ---
  /// Which source chain the DCW lives on. Present only for Circle bridges.
  /// Hand-rolled (CCTP V2 contract direct) bridges use a CctpChainKey (the
  /// 5 EVM testnets). App Kit bridges can additionally be 'solanaDevnet',
  /// which the hand-rolled path cannot handle — `appKit: true` below marks
  /// those records so resume logic skips them.
  sourceChainKey?: AppKitSourceChainKey;
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
  /// field landed — those fall back to the SDK's per-call auto-generated key.
  approveIdempotencyKey?: string;
  burnIdempotencyKey?: string;
  createdAt: number;
  updatedAt: number;
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
  const now = Date.now();
  const { status, ...rest } = input;
  const record: BridgeRelay = {
    ...rest,
    // Web3 bridges arrive already burned, so they default straight to
    // 'relaying'. Circle bridges pass 'approving' to enter the source pipeline.
    status: status ?? 'relaying',
    createdAt: now,
    updatedAt: now,
  };
  if (pgEnabled) {
    await db()
      .insert(bridges)
      .values({ bridgeId: record.bridgeId, data: record })
      .onConflictDoUpdate({ target: bridges.bridgeId, set: { data: record } });
    return record;
  }
  const store = loadFile();
  store[record.bridgeId] = record;
  saveFile(store);
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
    return next;
  }
  const store = loadFile();
  store[bridgeId] = next;
  saveFile(store);
  return next;
}

/// Bridges in any non-terminal state. Used to resume after a backend restart:
/// 'approving'/'burning' resume the Circle source pipeline, 'relaying' resumes
/// the IRIS-poll + Arc mint. Terminal states ('minted', 'error') are skipped.
export async function listPendingBridges(): Promise<BridgeRelay[]> {
  const isPending = (b: BridgeRelay) => b.status !== 'minted' && b.status !== 'error';
  if (pgEnabled) {
    const rows = await db().select().from(bridges);
    return rows.map((r) => r.data).filter(isPending);
  }
  return Object.values(loadFile()).filter(isPending);
}

/// Bridge records whose source-chain DCW is one of the given wallet addresses.
/// Powers the per-user bridge list so a user (or operator) can see the status of
/// every Circle bridge they've started. Newest first.
export async function listBridgesForWallets(
  walletAddresses: string[],
): Promise<BridgeRelay[]> {
  const set = new Set(walletAddresses.map((a) => a.toLowerCase()));
  const all = pgEnabled
    ? (await db().select().from(bridges)).map((r) => r.data)
    : Object.values(loadFile());
  return all
    .filter((b) => b.bridgeWalletAddress && set.has(b.bridgeWalletAddress.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);
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
