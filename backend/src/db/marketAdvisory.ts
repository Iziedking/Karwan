import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const STORE_PATH = resolve(process.cwd(), 'data', 'market-advisory.json');

/// The buyer agent's one-time overpay advisory for a deal: the budget sits well
/// above a grounded market price. Persisted so it survives a refresh and shows
/// on load, not only live over SSE. Non-destructive — it never changes the deal.
export interface MarketAdvisory {
  jobId: string;
  /// The buyer user address, so the read can be gated to the parties.
  buyer: string;
  budgetUsdc: number;
  fairPriceUsdc?: number;
  overPct: number;
  demand?: 'hot' | 'steady' | 'soft';
  note?: string;
  createdAt: number;
}

export function getMarketAdvisory(jobId: string): MarketAdvisory | null {
  return loadFile()[jobId.toLowerCase()] ?? null;
}

export function upsertMarketAdvisory(adv: MarketAdvisory): void {
  const store = loadFile();
  store[adv.jobId.toLowerCase()] = { ...adv, jobId: adv.jobId.toLowerCase(), buyer: adv.buyer.toLowerCase() };
  saveFile(store);
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, MarketAdvisory> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, MarketAdvisory>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, MarketAdvisory>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
