import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { appendCapped, type BidOutcomeRecord } from '../agents/bidOutcome.js';
import { logger } from '../logger.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'bid-outcomes.json');

/// How each of a seller agent's bids ended, keyed by seller agent address.
/// The live bid map forgets a bid once it concludes; this keeps the answer so
/// the seller desk can say won, lost, withdrawn or expired.
type Store = Record<string, BidOutcomeRecord[]>;

function load(): Store {
  try {
    if (!existsSync(STORE_PATH)) return {};
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Store;
  } catch {
    return {};
  }
}

function save(store: Store): void {
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(store), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'bid outcomes: persist failed');
  }
}

export function recordBidOutcomes(records: readonly BidOutcomeRecord[]): void {
  if (records.length === 0) return;
  const store = load();
  for (const record of records) {
    const key = record.sellerAgent.toLowerCase();
    store[key] = appendCapped(store[key] ?? [], { ...record, sellerAgent: key });
  }
  save(store);
}

export function listBidOutcomes(sellerAgent: string): BidOutcomeRecord[] {
  return load()[sellerAgent.toLowerCase()] ?? [];
}
