import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const STORE_PATH = resolve(process.cwd(), 'data', 'direct-deals.json');

export interface DirectDeal {
  jobId: string;
  // The user wallet that created the deal. The on-chain escrow buyer is the
  // buyer agent; this is who the deal belongs to for dashboards and auth checks.
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  firstReleasePct: number;
  deadlineUnix: number;
  terms: string;
  delivered: boolean;
  deliveredAt?: number;
  settledAt?: number;
  fundTxHash?: string;
  createdAt: number;
  updatedAt: number;
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function load(): Record<string, DirectDeal> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, DirectDeal>;
  } catch {
    return {};
  }
}

function save(store: Record<string, DirectDeal>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function getDeal(jobId: string): DirectDeal | null {
  return load()[jobId.toLowerCase()] ?? null;
}

export function createDeal(
  input: Omit<DirectDeal, 'delivered' | 'createdAt' | 'updatedAt'>,
): DirectDeal {
  const store = load();
  const now = Date.now();
  const deal: DirectDeal = {
    ...input,
    buyer: input.buyer.toLowerCase(),
    seller: input.seller.toLowerCase(),
    delivered: false,
    createdAt: now,
    updatedAt: now,
  };
  store[input.jobId.toLowerCase()] = deal;
  save(store);
  return deal;
}

export function patchDeal(jobId: string, patch: Partial<DirectDeal>): DirectDeal | null {
  const store = load();
  const key = jobId.toLowerCase();
  const existing = store[key];
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: Date.now() };
  store[key] = next;
  save(store);
  return next;
}

/// Deals where the address is either the buyer (creator) or the seller.
export function listDealsForAddress(address: string): DirectDeal[] {
  const a = address.toLowerCase();
  return Object.values(load())
    .filter((d) => d.buyer === a || d.seller === a)
    .sort((x, y) => y.createdAt - x.createdAt);
}
