import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq, desc } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { documentAnchors } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'document-anchors.json');

export type DocumentKind = 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';

export interface DocumentAnchor {
  /// Composite uniqueness key: `${invoiceId}:${hash}`. One row per
  /// (invoice, hash) pair. Anchors are append-only on chain but we never
  /// store the same hash twice for the same invoice.
  id: string;
  /// The deal's jobId; matches DirectDeal.jobId.
  invoiceId: string;
  hash: string;
  kind: DocumentKind;
  /// Free-text label captured at anchor time, e.g. "PO_1234.pdf". Optional.
  label?: string;
  /// Wallet address that submitted the anchor tx. Either the deal's buyer
  /// or seller (the on-chain contract enforces this).
  anchorer: string;
  /// Unix ms of the anchoring event.
  anchoredAt: number;
  /// The on-chain tx hash that landed the anchor. Empty until the bus
  /// listener confirms.
  txHash?: string;
  createdAt: number;
  updatedAt: number;
}

// Repository API

export async function getDocumentAnchor(id: string): Promise<DocumentAnchor | null> {
  if (pgEnabled) {
    const rows = await db().select().from(documentAnchors).where(eq(documentAnchors.id, id));
    return rows[0]?.data ?? null;
  }
  return loadFile()[id] ?? null;
}

export async function createDocumentAnchor(
  input: Omit<DocumentAnchor, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<DocumentAnchor> {
  const now = Date.now();
  const id = `${input.invoiceId.toLowerCase()}:${input.hash.toLowerCase()}`;
  const anchor: DocumentAnchor = {
    ...input,
    id,
    invoiceId: input.invoiceId.toLowerCase(),
    hash: input.hash.toLowerCase(),
    anchorer: input.anchorer.toLowerCase(),
    createdAt: now,
    updatedAt: now,
  };
  if (pgEnabled) {
    await db().insert(documentAnchors).values({
      id: anchor.id,
      invoiceId: anchor.invoiceId,
      anchorer: anchor.anchorer,
      anchoredAt: anchor.anchoredAt,
      data: anchor,
    });
    return anchor;
  }
  const store = loadFile();
  store[anchor.id] = anchor;
  saveFile(store);
  return anchor;
}

export async function patchDocumentAnchor(
  id: string,
  patch: Partial<DocumentAnchor>,
): Promise<DocumentAnchor | null> {
  const existing = await getDocumentAnchor(id);
  if (!existing) return null;
  const next: DocumentAnchor = { ...existing, ...patch, updatedAt: Date.now() };
  if (pgEnabled) {
    await db()
      .update(documentAnchors)
      .set({ data: next })
      .where(eq(documentAnchors.id, id));
    return next;
  }
  const store = loadFile();
  store[id] = next;
  saveFile(store);
  return next;
}

/// All anchors for an invoice, in anchoring order (oldest first to match
/// the on-chain append-only history).
export async function listAnchorsForInvoice(invoiceId: string): Promise<DocumentAnchor[]> {
  const key = invoiceId.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(documentAnchors)
      .where(eq(documentAnchors.invoiceId, key))
      .orderBy(documentAnchors.anchoredAt);
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((a) => a.invoiceId === key)
    .sort((x, y) => x.anchoredAt - y.anchoredAt);
}

/// Most-recent anchors across all invoices. Used by the admin activity
/// page; capped at 100 by default.
export async function listRecentAnchors(limit = 100): Promise<DocumentAnchor[]> {
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(documentAnchors)
      .orderBy(desc(documentAnchors.anchoredAt))
      .limit(limit);
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .sort((x, y) => y.anchoredAt - x.anchoredAt)
    .slice(0, limit);
}

// Flat-file

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, DocumentAnchor> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, DocumentAnchor>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, DocumentAnchor>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
