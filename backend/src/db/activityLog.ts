import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, eq, gte, desc } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { activityLog } from './schema.js';
import { logger } from '../logger.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'activity-log.json');

/// Money movements that have no durable store of their own (deals live in
/// direct_deals, bridges in bridges). Written by the executing route on
/// success, so the assistant's recall covers actions taken through the
/// regular UI too, not only through chat.
export type ActivityKind =
  | 'withdraw'
  | 'agent_topup'
  | 'gateway_deposit'
  | 'gateway_fund_agent'
  | 'gateway_cash_out'
  | 'release'
  | 'yield_claim'
  | 'refund';

/// One recorded money movement on a user's account. `address` is always the
/// session identity the route verified — never a client-supplied value — so a
/// recall for one user can never surface another user's history.
export interface ActivityEntry {
  id: string;
  address: string;
  ts: number;
  kind: ActivityKind;
  /// One plain sentence, written at record time, that stands alone.
  summary: string;
  amountUsdc?: string;
  /// On-chain Arc tx hash when the move settled in one tx.
  txHash?: string;
  /// Gateway transfer reference when there is no single tx hash.
  refId?: string;
  jobId?: string;
  /// Destination chain key for cross-chain moves.
  chain?: string;
  /// The other address involved (recipient, seller, ...), lowercase.
  counterparty?: string;
}

/// Append one entry. Never throws: recording memory must never fail the money
/// move that just succeeded, so errors are logged and swallowed. Call sites
/// use `void appendActivity(...)`.
export async function appendActivity(
  input: Omit<ActivityEntry, 'id' | 'ts'>,
): Promise<void> {
  const entry: ActivityEntry = {
    ...input,
    id: randomUUID(),
    address: input.address.toLowerCase(),
    ts: Date.now(),
  };
  try {
    if (pgEnabled) {
      await db().insert(activityLog).values({
        id: entry.id,
        address: entry.address,
        ts: entry.ts,
        data: entry,
      });
      return;
    }
    const store = loadFile();
    store[entry.id] = entry;
    saveFile(store);
  } catch (err) {
    logger.warn(
      { kind: entry.kind, err: (err as Error).message },
      'activity log append failed',
    );
  }
}

/// A user's recorded money movements since `sinceTs`, newest first.
export async function listActivityForAddress(
  address: string,
  sinceTs: number,
  limit = 60,
): Promise<ActivityEntry[]> {
  const a = address.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.address, a), gte(activityLog.ts, sinceTs)))
      .orderBy(desc(activityLog.ts))
      .limit(limit);
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((e) => e.address === a && e.ts >= sinceTs)
    .sort((x, y) => y.ts - x.ts)
    .slice(0, limit);
}

// --- flat-file fallback ---

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, ActivityEntry> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, ActivityEntry>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, ActivityEntry>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
