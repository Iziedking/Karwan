import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { agentWallets } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'agent-wallets.json');

export interface AgentWallets {
  // The user's identity wallet, lowercased. Keys the per-user agent pair.
  userAddress: string;
  buyerWalletId: string;
  buyerAddress: string;
  sellerWalletId: string;
  sellerAddress: string;
  createdAt: number;
  /// Optional human names the user gave their agents at activation (or later via
  /// the rename endpoint). Blank/unset means the UI shows "Buyer agent" /
  /// "Seller agent". Lets the negotiation read like the user's own assistant.
  buyerName?: string;
  sellerName?: string;
  /// Optional per-chain bridge DCWs (one per CCTP source chain). Keyed by
  /// the Circle blockchain enum string (e.g. 'BASE-SEPOLIA', 'ETH-SEPOLIA').
  /// Provisioned at activation for the common testnet source (Base Sepolia)
  /// and lazy-added the first time a user bridges from a different chain.
  /// Lets the backend sign the CCTP burn from the source-chain DCW so
  /// Circle-auth users can bridge end-to-end without a web3 wallet.
  bridgeWallets?: Record<string, { walletId: string; address: string }>;
}

export async function getAgentWallets(userAddress: string): Promise<AgentWallets | null> {
  const key = userAddress.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(agentWallets)
      .where(eq(agentWallets.userAddress, key));
    return rows[0]?.data ?? null;
  }
  return loadFile()[key] ?? null;
}

export async function listAllAgentWallets(): Promise<AgentWallets[]> {
  if (pgEnabled) {
    const rows = await db().select().from(agentWallets);
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile());
}

// Reverse-lookup cache: agentAddress -> owner record. Without it,
// findAgentWalletByAgentAddress loads + scans the whole table on every call,
// and it sits on the per-bid agent hot path (actorSignalsFor resolves an agent
// wallet to its owner account for reputation on every BidSubmitted / counter /
// listing match). Short TTL so a newly-activated user self-heals across
// processes; saveAgentWallets clears it immediately for the local process.
let reverseCache: { map: Map<string, AgentWallets>; builtAt: number } | null = null;
const REVERSE_CACHE_TTL_MS = 60_000;

function invalidateReverseCache() {
  reverseCache = null;
}

/// Finds the agent wallet record that owns a given agent address, matching on
/// either the buyer or the seller agent address. Used for reverse lookups when
/// only the on-chain agent address is known. Cached (see above) so it doesn't
/// re-scan the table on every bid.
export async function findAgentWalletByAgentAddress(
  agentAddress: string,
): Promise<AgentWallets | null> {
  const a = agentAddress.toLowerCase();
  const now = Date.now();
  if (!reverseCache || now - reverseCache.builtAt > REVERSE_CACHE_TTL_MS) {
    const all = await listAllAgentWallets();
    const map = new Map<string, AgentWallets>();
    for (const w of all) {
      map.set(w.buyerAddress, w);
      map.set(w.sellerAddress, w);
    }
    reverseCache = { map, builtAt: now };
  }
  return reverseCache.map.get(a) ?? null;
}

export async function saveAgentWallets(
  input: Omit<AgentWallets, 'createdAt'>,
): Promise<AgentWallets> {
  const key = input.userAddress.toLowerCase();
  const record: AgentWallets = {
    ...input,
    userAddress: key,
    buyerAddress: input.buyerAddress.toLowerCase(),
    sellerAddress: input.sellerAddress.toLowerCase(),
    createdAt: Date.now(),
  };
  if (pgEnabled) {
    await db()
      .insert(agentWallets)
      .values({ userAddress: key, data: record })
      .onConflictDoUpdate({ target: agentWallets.userAddress, set: { data: record } });
    invalidateReverseCache();
    return record;
  }
  const store = loadFile();
  store[key] = record;
  saveFile(store);
  invalidateReverseCache();
  return record;
}

/// Update just the agent display names, preserving every other field including
/// createdAt (saveAgentWallets resets createdAt, which would wipe the agent's
/// age, so renames must not go through it). Pass a name to set it, or undefined
/// to clear it back to the default label. Returns null if the user has no
/// agents yet.
export async function updateAgentNames(
  userAddress: string,
  names: { buyerName?: string; sellerName?: string },
): Promise<AgentWallets | null> {
  const key = userAddress.toLowerCase();
  const existing = await getAgentWallets(key);
  if (!existing) return null;
  const next: AgentWallets = {
    ...existing,
    buyerName: names.buyerName,
    sellerName: names.sellerName,
  };
  if (pgEnabled) {
    await db().update(agentWallets).set({ data: next }).where(eq(agentWallets.userAddress, key));
    invalidateReverseCache();
    return next;
  }
  const store = loadFile();
  store[key] = next;
  saveFile(store);
  invalidateReverseCache();
  return next;
}

// --- flat-file fallback ---

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, AgentWallets> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, AgentWallets>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, AgentWallets>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
