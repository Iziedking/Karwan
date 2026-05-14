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

/// Finds the agent wallet record that owns a given agent address, matching on
/// either the buyer or the seller agent address. Used for reverse lookups when
/// only the on-chain agent address is known.
export async function findAgentWalletByAgentAddress(
  agentAddress: string,
): Promise<AgentWallets | null> {
  const a = agentAddress.toLowerCase();
  const all = await listAllAgentWallets();
  return (
    all.find((w) => w.buyerAddress === a || w.sellerAddress === a) ?? null
  );
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
    return record;
  }
  const store = loadFile();
  store[key] = record;
  saveFile(store);
  return record;
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
