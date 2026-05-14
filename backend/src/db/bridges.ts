import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { bridges } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'bridges.json');

export type BridgeStatus = 'relaying' | 'minted' | 'error';

export interface BridgeRelay {
  bridgeId: string;
  sourceDomain: number;
  sourceTxHash: string;
  amountUsdc: string;
  mintRecipient: string;
  status: BridgeStatus;
  mintTxHash?: string;
  error?: string;
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
  input: Omit<BridgeRelay, 'status' | 'createdAt' | 'updatedAt'>,
): Promise<BridgeRelay> {
  const now = Date.now();
  const record: BridgeRelay = {
    ...input,
    status: 'relaying',
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

/// Bridges that burned but never reached a mint or error. Used to resume relays
/// after a backend restart.
export async function listPendingBridges(): Promise<BridgeRelay[]> {
  if (pgEnabled) {
    const rows = await db().select().from(bridges);
    return rows.map((r) => r.data).filter((b) => b.status === 'relaying');
  }
  return Object.values(loadFile()).filter((b) => b.status === 'relaying');
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
