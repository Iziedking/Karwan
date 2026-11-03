import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '../logger.js';
import { pgEnabled, postgresExecutor } from './client.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'near-miss.json');

/// A "near-miss": the agents found a real topical match, but the best achievable
/// price lands just outside one party's authorized range. Instead of silently
/// skipping, the agent asks that party "I found a deal at X, that's [above your
/// cap / below your floor], proceed?" via the bell + Telegram, valid for a window.
///
/// "Ask the blocked side" closes the deal in a single yes: we anchor the price at
/// the OTHER party's boundary, so they are already within their authorization and
/// no second gate is needed. When no overlap exists at all, the buyer is asked
/// first (at the seller's floor); if they decline, the seller is asked (at the
/// buyer's ceiling).
export interface NearMissApproval {
  jobId: string;
  buyerUser: string;
  buyerAgent: string;
  sellerUser: string;
  sellerAgent: string;
  /// The party currently being asked to stretch beyond their range.
  askedSide: 'buyer' | 'seller';
  askedUser: string;
  /// The single price the deal closes at if the asked party proceeds.
  proceedPriceUsdc: string;
  /// The asked party's breached boundary: their cap (buyer) or floor (seller).
  limitUsdc: string;
  /// Absolute distance between the proceed price and the asked party's limit.
  gapUsdc: string;
  /// Both boundaries, kept so a buyer decline can flip the ask to the seller.
  buyerCeilingUsdc: string;
  sellerFloorUsdc: string;
  createdAt: number;
  /// Consent window. After this, the near-miss lapses and nothing funds.
  expiresAt: number;
  proceededAt?: number;
  declinedAt?: number;
  /// True once the buyer has had (and passed on) their turn, so a flip to the
  /// seller can't loop back to the buyer.
  buyerAsked?: boolean;
  /// Market analysis that justifies the over-cap price, when the agent paid to
  /// research the deal. Surfaced in the proceed-or-pass alert so the buyer sees
  /// WHY the best price sits above their budget ("market demand is hot...").
  marketDemand?: 'hot' | 'steady' | 'soft';
  marketNote?: string;
  /// Grounded market price for the deal, when known. Shows the buyer the
  /// concrete number behind "best match is above your budget".
  marketFairPriceUsdc?: number;
}

export function isPending(n: NearMissApproval, now = Date.now()): boolean {
  return !n.proceededAt && !n.declinedAt && n.expiresAt > now;
}

export function getNearMiss(jobId: string): NearMissApproval | null {
  return records().get(jobId.toLowerCase()) ?? null;
}

/// The pending near-miss for a job, or null if none / resolved / lapsed.
export function getPendingNearMiss(jobId: string): NearMissApproval | null {
  const n = getNearMiss(jobId);
  return n && isPending(n) ? n : null;
}

/// Remove a job's near-miss record entirely. Used when a passed near-miss
/// re-opens the auction: clearing the resolved record lets a genuinely new
/// seller raise a fresh near-miss instead of being blocked by "already-resolved".
export function clearNearMiss(jobId: string): void {
  const key = jobId.toLowerCase();
  if (records().delete(key)) saved(key);
}

export function upsertNearMiss(n: NearMissApproval): NearMissApproval {
  const next: NearMissApproval = {
    ...n,
    jobId: n.jobId.toLowerCase(),
    buyerUser: n.buyerUser.toLowerCase(),
    buyerAgent: n.buyerAgent.toLowerCase(),
    sellerUser: n.sellerUser.toLowerCase(),
    sellerAgent: n.sellerAgent.toLowerCase(),
    askedUser: n.askedUser.toLowerCase(),
  };
  records().set(next.jobId, next);
  saved(next.jobId);
  return next;
}

/// Every pending near-miss where the address is the party being asked. Powers
/// the home + seller dashboards so a user finds their near-misses without a jobId.
export function listPendingNearMissForUser(address: string): NearMissApproval[] {
  const a = address.toLowerCase();
  const now = Date.now();
  return [...records().values()]
    .filter((n) => n.askedUser === a && isPending(n, now))
    .sort((x, y) => y.createdAt - x.createdAt);
}

export function deleteNearMissInvolvingAddress(addressLower: string): number {
  const target = addressLower.toLowerCase();
  let removed = 0;
  for (const [k, v] of [...records()]) {
    if (v.buyerUser === target || v.sellerUser === target) {
      records().delete(k);
      saved(k);
      removed += 1;
    }
  }
  return removed;
}

/// Resolves once the latest change to a job's near-miss is stored. A raise
/// awaits this before telling the person, so a restart never loses the ask.
export function nearMissSaved(jobId: string): Promise<void> {
  return writes.get(jobId.toLowerCase()) ?? Promise.resolve();
}

/// Loads the near-misses at boot. With Postgres they live in `near_misses_v1`
/// (view 48, decision 8); the old file is imported once when the table is empty.
export async function hydrateNearMisses(): Promise<number> {
  if (!pgEnabled) {
    cache = loadFile();
    return cache.size;
  }
  const res = await postgresExecutor().query('SELECT data FROM near_misses_v1');
  const loaded = new Map<string, NearMissApproval>();
  for (const row of res.rows as Array<{ data: NearMissApproval }>) loaded.set(row.data.jobId, row.data);
  if (loaded.size === 0 && existsSync(STORE_PATH)) {
    for (const [k, v] of loadFile()) {
      loaded.set(k, v);
      await writeRow(k, v);
    }
  }
  cache = loaded;
  return loaded.size;
}

// --- storage. Postgres when enabled, written in order per job behind an
// in-memory copy the sync reads use; the data/ file otherwise. ---

let cache: Map<string, NearMissApproval> | null = null;
const writes = new Map<string, Promise<void>>();

function records(): Map<string, NearMissApproval> {
  cache ??= pgEnabled ? new Map() : loadFile();
  return cache;
}

async function writeRow(key: string, record: NearMissApproval | undefined): Promise<void> {
  if (record) {
    await postgresExecutor().query(
      'INSERT INTO near_misses_v1 (job_id, updated_at, data) VALUES ($1, $2, $3) ON CONFLICT (job_id) DO UPDATE SET updated_at = EXCLUDED.updated_at, data = EXCLUDED.data',
      [key, Date.now(), record],
    );
  } else {
    await postgresExecutor().query('DELETE FROM near_misses_v1 WHERE job_id = $1', [key]);
  }
}

function saved(key: string): void {
  if (!pgEnabled) {
    saveFile(records());
    return;
  }
  const previous = writes.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => writeRow(key, records().get(key)))
    .catch((err) => {
      logger.warn({ jobId: key, err: (err as Error).message }, 'near-miss write failed');
      throw err;
    });
  writes.set(key, next);
  void next.catch(() => undefined).finally(() => {
    if (writes.get(key) === next) writes.delete(key);
  });
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Map<string, NearMissApproval> {
  ensureFile();
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, NearMissApproval>));
  } catch {
    return new Map();
  }
}

function saveFile(store: Map<string, NearMissApproval>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(Object.fromEntries(store), null, 2), 'utf8');
}
