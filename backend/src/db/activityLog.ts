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
  /// An inbound deposit from another chain, credited when Circle's webhook says
  /// it landed. Distinct from gateway_deposit, which is the pool, not the user.
  | 'deposit'
  | 'withdraw'
  | 'agent_topup'
  | 'gateway_deposit'
  | 'gateway_fund_agent'
  | 'gateway_cash_out'
  | 'release'
  | 'yield_claim'
  | 'refund'
  | 'stake'
  | 'unstake'
  | 'agent_seed'
  | 'agent_spend'
  /// The RECEIVING side of a deal release. Every release used to write one row,
  /// for the buyer who sent the money, so a seller's history was silent about
  /// every payment they had ever been paid.
  | 'payout'
  /// Trade finance, which wrote no ledger rows at all until now. A financier
  /// who funded an advance and was later repaid saw nothing in their own
  /// history. `funded` and `repaid` are the financier's two sides; `received`
  /// is the seller taking the advance.
  | 'financing_funded'
  | 'financing_received'
  | 'financing_repaid';

/// One recorded money movement on a user's account. `address` is always the
/// session identity the route verified — never a client-supplied value — so a
/// recall for one user can never surface another user's history.
export interface ActivityEntry {
  id: string;
  address: string;
  ts: number;
  kind: ActivityKind;
  /// One plain sentence, written at record time, that stands alone. English.
  /// Stays the fallback: rows written before `params` existed only have this.
  summary: string;
  /// Structured fields so the reader's locale, not the writer's, decides the
  /// wording. `t` names the client template; the rest are its placeholders.
  params?: Record<string, string>;
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
///
/// `id` is optional and normally left to us. Pass one derived from the thing
/// being recorded when the writer can run twice over the same movement (a
/// watcher that rescans a block window after a restart, say); the insert then
/// no-ops on the second pass instead of showing the user their money twice.
export async function appendActivity(
  input: Omit<ActivityEntry, 'id' | 'ts'> & { id?: string },
): Promise<void> {
  const entry: ActivityEntry = {
    ...input,
    id: input.id ?? randomUUID(),
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
      }).onConflictDoNothing();
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
