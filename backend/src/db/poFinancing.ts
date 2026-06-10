import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq, desc } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { poFinancingLines } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'po-financing-lines.json');

export type POFinancingState =
  | 'funded'      // financier deposited, awaiting PoD
  | 'released'    // PoD anchored, principal sent to seller, awaiting repayment
  | 'repaid'      // financier repaid via claimRepayment
  | 'reclaimed'   // financier reclaimed pre-PoD timeout
  | 'defaulted';  // post-release timeout passed without repayment

export interface POFinancingLine {
  id: string;
  /// The deal's jobId; same as DirectDeal.jobId and the on-chain
  /// KarwanPOFinancing.lines() key.
  invoiceId: string;
  financier: string;
  seller: string;
  buyer: string;
  principalUsdc: string;
  repayUsdc: string;
  state: POFinancingState;
  fundedAt: number;
  /// Mirror of on-chain releaseTimeoutAt. After this, financier may call
  /// reclaimPrincipal if PoD never lands.
  releaseTimeoutAt: number;
  releasedAt?: number;
  /// Mirror of on-chain repaymentTimeoutAt. After this, financier may call
  /// markDefaulted if repayment never came.
  repaymentTimeoutAt?: number;
  repaidAt?: number;
  podHash?: string;
  txHashes: {
    fund?: string;
    release?: string;
    repay?: string;
    reclaim?: string;
    default?: string;
  };
  createdAt: number;
  updatedAt: number;
}

// Repository API

export async function getPOLine(id: string): Promise<POFinancingLine | null> {
  if (pgEnabled) {
    const rows = await db().select().from(poFinancingLines).where(eq(poFinancingLines.id, id));
    return rows[0]?.data ?? null;
  }
  return loadFile()[id] ?? null;
}

/// Each invoice carries at most one active PO line. Returns the line keyed
/// by invoiceId, or null if no line was ever opened on this invoice.
export async function getPOLineForInvoice(invoiceId: string): Promise<POFinancingLine | null> {
  const key = invoiceId.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(poFinancingLines)
      .where(eq(poFinancingLines.invoiceId, key));
    return rows[0]?.data ?? null;
  }
  return Object.values(loadFile()).find((l) => l.invoiceId === key) ?? null;
}

export async function createPOLine(
  input: Omit<POFinancingLine, 'createdAt' | 'updatedAt' | 'txHashes'> & {
    txHashes?: POFinancingLine['txHashes'];
  },
): Promise<POFinancingLine> {
  const now = Date.now();
  const line: POFinancingLine = {
    ...input,
    financier: input.financier.toLowerCase(),
    seller: input.seller.toLowerCase(),
    buyer: input.buyer.toLowerCase(),
    invoiceId: input.invoiceId.toLowerCase(),
    txHashes: input.txHashes ?? {},
    createdAt: now,
    updatedAt: now,
  };
  if (pgEnabled) {
    await db().insert(poFinancingLines).values({
      id: line.id,
      invoiceId: line.invoiceId,
      financier: line.financier,
      seller: line.seller,
      state: line.state,
      fundedAt: line.fundedAt,
      data: line,
    });
    return line;
  }
  const store = loadFile();
  store[line.id] = line;
  saveFile(store);
  return line;
}

export async function patchPOLine(
  id: string,
  patch: Partial<POFinancingLine>,
): Promise<POFinancingLine | null> {
  const existing = await getPOLine(id);
  if (!existing) return null;
  const next: POFinancingLine = {
    ...existing,
    ...patch,
    txHashes: { ...existing.txHashes, ...(patch.txHashes ?? {}) },
    updatedAt: Date.now(),
  };
  if (pgEnabled) {
    await db()
      .update(poFinancingLines)
      .set({ state: next.state, data: next })
      .where(eq(poFinancingLines.id, id));
    return next;
  }
  const store = loadFile();
  store[id] = next;
  saveFile(store);
  return next;
}

/// All lines visible to a financier: every line they funded, any state.
export async function listLinesByFinancier(financier: string): Promise<POFinancingLine[]> {
  const key = financier.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(poFinancingLines)
      .where(eq(poFinancingLines.financier, key))
      .orderBy(desc(poFinancingLines.fundedAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((l) => l.financier === key)
    .sort((x, y) => y.fundedAt - x.fundedAt);
}

/// All lines visible to a seller: every line opened against an invoice
/// they raised, any state.
export async function listLinesBySeller(seller: string): Promise<POFinancingLine[]> {
  const key = seller.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(poFinancingLines)
      .where(eq(poFinancingLines.seller, key))
      .orderBy(desc(poFinancingLines.fundedAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((l) => l.seller === key)
    .sort((x, y) => y.fundedAt - x.fundedAt);
}

/// Lines in a non-terminal state. Used by the timeout watcher to find
/// candidates for reclaimPrincipal / markDefaulted prompts.
export async function listOpenLines(): Promise<POFinancingLine[]> {
  if (pgEnabled) {
    const fundedRows = await db()
      .select()
      .from(poFinancingLines)
      .where(eq(poFinancingLines.state, 'funded'));
    const releasedRows = await db()
      .select()
      .from(poFinancingLines)
      .where(eq(poFinancingLines.state, 'released'));
    return [...fundedRows, ...releasedRows]
      .map((r) => r.data)
      .sort((x, y) => y.fundedAt - x.fundedAt);
  }
  return Object.values(loadFile())
    .filter((l) => l.state === 'funded' || l.state === 'released')
    .sort((x, y) => y.fundedAt - x.fundedAt);
}

/// All lines for a specific sector / region pairing. Used by the
/// /financier dashboard for filtered views (no PG-side index for this;
/// scans all). The filter applies to the seller's stored region, we
/// pull the seller profile separately in the route layer.
export async function listAllLines(): Promise<POFinancingLine[]> {
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(poFinancingLines)
      .orderBy(desc(poFinancingLines.fundedAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile()).sort((x, y) => y.fundedAt - x.fundedAt);
}

// Flat-file

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, POFinancingLine> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, POFinancingLine>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, POFinancingLine>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
