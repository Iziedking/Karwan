import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { agentWallets } from './schema.js';
import { logger } from '../logger.js';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

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
  /// Dedicated EOA DCW for x402 payment authorizations on Arc. Gateway
  /// verifies authorizations statically offchain and rejects EIP-1271
  /// signatures, so the agent SCAs can't sign payments themselves; this
  /// EOA owns the Gateway deposit (funded via depositFor from the buyer
  /// agent SCA) and signs EIP-3009. Lazy-provisioned on first paid call.
  x402Wallet?: { walletId: string; address: string };
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

// Reverse-lookup cache: agentAddress -> owner record. Without it,
// findAgentWalletByAgentAddress loads + scans the whole table on every call,
// and it sits on the per-bid agent hot path (actorSignalsFor resolves an agent
// wallet to its owner account for reputation on every BidSubmitted / counter /
// listing match). Short TTL so a newly-activated user self-heals across
// processes; the writers below clear it immediately for the local process.
let reverseCache: { map: Map<string, AgentWallets>; builtAt: number } | null = null;
const REVERSE_CACHE_TTL_MS = 60_000;

// Full-list cache. listAllAgentWallets is called by the balance watcher every
// 60s and by the buyer-history scan + admin surfaces; without this each call
// pulls the whole agent_wallets table over the wire (~21kB/scan, the second
// largest Neon egress drain after the deals loop). The default 5min TTL holds
// ~1440 reads/day down to ~288. A write (activation) busts the cache in-process
// immediately, and the balance watcher shares that process, so a newly
// activated wallet is still watched without delay. Set AGENT_WALLETS_CACHE_TTL_MS=0
// to disable.
let listCache: { rows: AgentWallets[]; builtAt: number } | null = null;
const LIST_CACHE_TTL_MS = Number(process.env.AGENT_WALLETS_CACHE_TTL_MS ?? 300_000);

function invalidateAgentWalletCaches() {
  reverseCache = null;
  listCache = null;
}

export async function listAllAgentWallets(): Promise<AgentWallets[]> {
  const now = Date.now();
  if (LIST_CACHE_TTL_MS > 0 && listCache && now - listCache.builtAt < LIST_CACHE_TTL_MS) {
    return listCache.rows.slice();
  }
  let rows: AgentWallets[];
  if (pgEnabled) {
    const result = await db().select().from(agentWallets);
    rows = result.map((r) => r.data);
  } else {
    rows = Object.values(loadFile());
  }
  if (LIST_CACHE_TTL_MS > 0) listCache = { rows, builtAt: now };
  return rows.slice();
}

/// Finds the agent wallet record that owns a given agent address, matching on
/// either the buyer or the seller agent address. Used for reverse lookups when
/// only the on-chain agent address is known. Cached (see above) so it doesn't
/// re-scan the table on every bid.
export async function findAgentWalletByAgentAddress(
  agentAddress: string,
): Promise<AgentWallets | null> {
  const a = agentAddress.toLowerCase();
  if (!a || a === ZERO_ADDR) return null;
  const now = Date.now();
  if (!reverseCache || now - reverseCache.builtAt > REVERSE_CACHE_TTL_MS) {
    const all = await listAllAgentWallets();
    const map = new Map<string, AgentWallets>();
    for (const w of all) {
      for (const addr of [w.buyerAddress, w.sellerAddress]) {
        // Skip blank/placeholder addresses so a half-provisioned record can't
        // poison the map under a shared empty key.
        if (!addr || addr === ZERO_ADDR) continue;
        const existing = map.get(addr);
        // A real agent address belongs to exactly one user. If two records
        // claim the same address (corrupt/duplicated data, e.g. after a
        // migration), KEEP THE FIRST and do not let the later one overwrite it —
        // a silent overwrite is what made one user's seller agent look like
        // everyone's "own" agent and get wrongly excluded from every auction.
        if (existing && existing.userAddress !== w.userAddress) {
          logger.warn(
            { addr, users: [existing.userAddress, w.userAddress] },
            'agent-wallet address claimed by two users; ignoring the duplicate. Data needs dedupe.',
          );
          continue;
        }
        map.set(addr, w);
      }
    }
    reverseCache = { map, builtAt: now };
  }
  const result = reverseCache.map.get(a) ?? null;
  // Only ever return a record that actually owns this address. Guards against a
  // poisoned/stale entry making one agent resolve to another user's wallet.
  if (result && result.buyerAddress !== a && result.sellerAddress !== a) {
    logger.warn(
      { agentAddress: a, returnedUser: result.userAddress },
      'reverse-cache returned a record that does not own the looked-up address; treating as unknown',
    );
    return null;
  }
  return result;
}

/// Integrity scan over all agent-wallet records. A real agent address must
/// belong to exactly one user; any address claimed by two+ users is the corrupt
/// data that makes a seller agent get wrongly 'own-auction' excluded from
/// everyone's deals. Also flags blank/placeholder agent addresses.
export async function agentWalletIntegrity(): Promise<{
  total: number;
  emptyBuyer: string[];
  emptySeller: string[];
  sharedAddresses: { address: string; role: 'buyer' | 'seller' | 'mixed'; users: string[] }[];
}> {
  const all = await listAllAgentWallets();
  const byAddr = new Map<string, { buyers: Set<string>; sellers: Set<string> }>();
  const emptyBuyer: string[] = [];
  const emptySeller: string[] = [];
  const bump = (addr: string, user: string, role: 'buyer' | 'seller') => {
    if (!addr || addr === ZERO_ADDR) return;
    const e = byAddr.get(addr) ?? { buyers: new Set<string>(), sellers: new Set<string>() };
    (role === 'buyer' ? e.buyers : e.sellers).add(user);
    byAddr.set(addr, e);
  };
  for (const w of all) {
    if (!w.buyerAddress || w.buyerAddress === ZERO_ADDR) emptyBuyer.push(w.userAddress);
    if (!w.sellerAddress || w.sellerAddress === ZERO_ADDR) emptySeller.push(w.userAddress);
    bump(w.buyerAddress, w.userAddress, 'buyer');
    bump(w.sellerAddress, w.userAddress, 'seller');
  }
  const sharedAddresses: { address: string; role: 'buyer' | 'seller' | 'mixed'; users: string[] }[] = [];
  for (const [address, e] of byAddr) {
    const users = new Set([...e.buyers, ...e.sellers]);
    if (users.size > 1) {
      sharedAddresses.push({
        address,
        role: e.buyers.size && e.sellers.size ? 'mixed' : e.buyers.size ? 'buyer' : 'seller',
        users: [...users],
      });
    }
  }
  return { total: all.length, emptyBuyer, emptySeller, sharedAddresses };
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
    invalidateAgentWalletCaches();
    return record;
  }
  const store = loadFile();
  store[key] = record;
  saveFile(store);
  invalidateAgentWalletCaches();
  return record;
}

/// Attach the lazily-provisioned x402 EOA to an existing record, preserving
/// every other field including createdAt (same reason updateAgentNames does
/// not go through saveAgentWallets). Returns null if the user has no agents.
export async function updateX402Wallet(
  userAddress: string,
  x402Wallet: { walletId: string; address: string },
): Promise<AgentWallets | null> {
  const key = userAddress.toLowerCase();
  const existing = await getAgentWallets(key);
  if (!existing) return null;
  const next: AgentWallets = {
    ...existing,
    x402Wallet: { walletId: x402Wallet.walletId, address: x402Wallet.address.toLowerCase() },
  };
  if (pgEnabled) {
    await db().update(agentWallets).set({ data: next }).where(eq(agentWallets.userAddress, key));
    invalidateAgentWalletCaches();
    return next;
  }
  const store = loadFile();
  store[key] = next;
  saveFile(store);
  invalidateAgentWalletCaches();
  return next;
}

/// Correct the stored agent SCA addresses for a user, preserving every other
/// field including createdAt. The record captures the address Circle returns at
/// activation (the counterfactual SCA address); if Circle later migrates the
/// wallet set or upgrades the SCA implementation, the walletId keeps signing
/// from a NEW deployed address while our copy goes stale. A stale buyerAddress
/// silently breaks jobId derivation (keccak256(signer, salt)), the gas-balance
/// precheck, own-auction exclusion, and reputation keying. This re-syncs from
/// Circle's live getWallet. Pass only the sides that changed. Returns null if
/// the user has no agents.
export async function updateAgentAddresses(
  userAddress: string,
  addrs: { buyerAddress?: string; sellerAddress?: string },
): Promise<AgentWallets | null> {
  const key = userAddress.toLowerCase();
  const existing = await getAgentWallets(key);
  if (!existing) return null;
  const next: AgentWallets = {
    ...existing,
    buyerAddress: (addrs.buyerAddress ?? existing.buyerAddress).toLowerCase(),
    sellerAddress: (addrs.sellerAddress ?? existing.sellerAddress).toLowerCase(),
  };
  if (pgEnabled) {
    await db().update(agentWallets).set({ data: next }).where(eq(agentWallets.userAddress, key));
    invalidateAgentWalletCaches();
    return next;
  }
  const store = loadFile();
  store[key] = next;
  saveFile(store);
  invalidateAgentWalletCaches();
  return next;
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
    invalidateAgentWalletCaches();
    return next;
  }
  const store = loadFile();
  store[key] = next;
  saveFile(store);
  invalidateAgentWalletCaches();
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
