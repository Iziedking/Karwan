import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db, pgEnabled } from '../db/client.js';
import { depositRequests } from '../db/schema.js';

export type DepositRequestStatus =
  | 'open'
  | 'matched'
  | 'expired'
  | 'cancelled'
  | 'needs_attention';

export interface DepositRequest {
  id: string;
  token: string;
  owner: string;
  recipientAddress: string;
  amountUsdc: string | null;
  purpose: string;
  expiresAt: number;
  status: DepositRequestStatus;
  matchedTxId?: string;
  matchedChain?: string;
  matchedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DepositRequestPublic {
  requestId: string;
  recipientAddress: string;
  amountUsdc: string | null;
  purpose: string;
  expiresAt: number;
  status: DepositRequestStatus;
  createdAt: number;
  acceptedChains: string[];
}

export const REQUEST_TTL_MINUTES = 60;
export const MAX_REQUEST_TTL_MINUTES = 7 * 24 * 60;

const STORE_PATH = process.env.DEPOSIT_REQUESTS_STORE_PATH
  ? resolve(process.env.DEPOSIT_REQUESTS_STORE_PATH)
  : resolve(process.cwd(), 'data', 'deposit-requests.json');

const ACCEPTED_CHAINS = [
  'Ethereum',
  'Base',
  'Arbitrum',
  'Polygon',
  'Solana',
];

export function parseUsdcAmount(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return raw.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function usdcToMicros(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole ?? '0') * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

export function normalisePurpose(value: unknown): string {
  if (typeof value !== 'string') return 'USDC deposit';
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, 120) || 'USDC deposit';
}

export function createDepositRequest(input: {
  owner: string;
  amountUsdc?: unknown;
  purpose?: unknown;
  ttlMinutes?: unknown;
  now?: number;
}): DepositRequest {
  const amountUsdc = parseUsdcAmount(input.amountUsdc);
  if (input.amountUsdc !== undefined && input.amountUsdc !== null && input.amountUsdc !== '' && !amountUsdc) {
    throw new Error('Enter a valid USDC amount up to 6 decimal places.');
  }
  const requestedTtl = Number(input.ttlMinutes ?? REQUEST_TTL_MINUTES);
  const ttlMinutes = Number.isFinite(requestedTtl)
    ? Math.min(MAX_REQUEST_TTL_MINUTES, Math.max(5, Math.floor(requestedTtl)))
    : REQUEST_TTL_MINUTES;
  const now = input.now ?? Date.now();
  return {
    id: randomUUID(),
    token: randomUUID(),
    owner: input.owner.toLowerCase(),
    recipientAddress: input.owner.toLowerCase(),
    amountUsdc,
    purpose: normalisePurpose(input.purpose),
    expiresAt: now + ttlMinutes * 60_000,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
}

export function toPublicRequest(request: DepositRequest, now = Date.now()): DepositRequestPublic {
  return {
    requestId: request.token,
    recipientAddress: request.recipientAddress,
    amountUsdc: request.amountUsdc,
    purpose: request.purpose,
    expiresAt: request.expiresAt,
    status: request.status === 'open' && request.expiresAt <= now ? 'expired' : request.status,
    createdAt: request.createdAt,
    acceptedChains: ACCEPTED_CHAINS,
  };
}

export async function saveDepositRequest(request: DepositRequest): Promise<DepositRequest> {
  if (pgEnabled) {
    await db()
      .insert(depositRequests)
      .values({
        token: request.token,
        owner: request.owner,
        status: request.status,
        amountUsdc: request.amountUsdc,
        createdAt: request.createdAt,
        expiresAt: request.expiresAt,
        matchedTxId: request.matchedTxId ?? null,
        matchedChain: request.matchedChain ?? null,
        matchedAt: request.matchedAt ?? null,
        data: request,
      })
      .onConflictDoUpdate({
        target: depositRequests.token,
        set: {
          owner: request.owner,
          status: request.status,
          amountUsdc: request.amountUsdc,
          expiresAt: request.expiresAt,
          matchedTxId: request.matchedTxId ?? null,
          matchedChain: request.matchedChain ?? null,
          matchedAt: request.matchedAt ?? null,
          data: request,
        },
      });
    return request;
  }
  const store = loadFile();
  store[request.token] = request;
  saveFile(store);
  return request;
}

export async function getDepositRequest(token: string): Promise<DepositRequest | null> {
  if (pgEnabled) {
    const rows = await db().select().from(depositRequests).where(eq(depositRequests.token, token));
    return (rows[0]?.data as DepositRequest | undefined) ?? null;
  }
  return loadFile()[token] ?? null;
}

export async function listDepositRequests(owner: string, limit = 10): Promise<DepositRequest[]> {
  const normalised = owner.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(depositRequests)
      .where(eq(depositRequests.owner, normalised))
      .orderBy(desc(depositRequests.createdAt))
      .limit(limit);
    return rows.map((row) => row.data as DepositRequest);
  }
  return Object.values(loadFile())
    .filter((request) => request.owner === normalised)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function cancelDepositRequest(owner: string, token: string): Promise<DepositRequest | null> {
  const request = await getDepositRequest(token);
  if (!request || request.owner !== owner.toLowerCase()) return null;
  if (request.status !== 'open') return request;
  const next = { ...request, status: 'cancelled' as const, updatedAt: Date.now() };
  return saveDepositRequest(next);
}

export async function matchDepositRequest(input: {
  owner: string;
  amountUsdc: string;
  txId: string;
  chain: string;
  now?: number;
}): Promise<DepositRequest | null> {
  const now = input.now ?? Date.now();
  // A provider can deliver the same transaction again under a new
  // notification id. The durable transaction column makes that replay
  // idempotent even after a process restart.
  const previouslyMatched = await getDepositRequestByTxId(input.txId);
  if (previouslyMatched) {
    return previouslyMatched.owner === input.owner.toLowerCase() ? previouslyMatched : null;
  }

  const request = selectDepositRequest(await listDepositRequests(input.owner, 50), input);
  if (!request) return null;
  const next: DepositRequest = {
    ...request,
    status: 'matched',
    matchedTxId: input.txId,
    matchedChain: input.chain,
    matchedAt: now,
    updatedAt: now,
  };
  if (pgEnabled) {
    // The request row is the compare-and-set boundary. A duplicate provider
    // event or two different deposits racing for one request cannot overwrite
    // the first confirmed match.
    const rows = await db()
      .update(depositRequests)
      .set({
        status: 'matched',
        matchedTxId: input.txId,
        matchedChain: input.chain,
        matchedAt: now,
        data: next,
      })
      .where(and(eq(depositRequests.token, request.token), eq(depositRequests.status, 'open')))
      .returning({ data: depositRequests.data });
    return (rows[0]?.data as DepositRequest | undefined) ?? null;
  }

  return saveDepositRequest(next);
}

async function getDepositRequestByTxId(txId: string): Promise<DepositRequest | null> {
  if (pgEnabled) {
    const rows = await db()
      .select({ data: depositRequests.data })
      .from(depositRequests)
      .where(eq(depositRequests.matchedTxId, txId))
      .limit(1);
    return (rows[0]?.data as DepositRequest | undefined) ?? null;
  }
  return Object.values(loadFile()).find((request) => request.matchedTxId === txId) ?? null;
}

export function selectDepositRequest(
  requests: DepositRequest[],
  input: { amountUsdc: string; now?: number },
): DepositRequest | null {
  const now = input.now ?? Date.now();
  const candidates = requests.filter((request) => {
    if (request.status !== 'open' || request.expiresAt <= now) return false;
    // An open request without a fixed amount can still receive a payment, but
    // only when it is the sole open request. That keeps flexible requests useful
    // without guessing between several purposes.
    return !request.amountUsdc || usdcToMicros(request.amountUsdc) === usdcToMicros(input.amountUsdc);
  });
  // An exact amount is not enough when two requests are open. Leaving both
  // unmatched is safer than silently assigning a third-party payment to the
  // wrong purpose.
  return candidates.length === 1 ? candidates[0]! : null;
}

export function expireDepositRequest(request: DepositRequest, now = Date.now()): DepositRequest {
  if (request.status === 'open' && request.expiresAt <= now) {
    return { ...request, status: 'expired', updatedAt: now };
  }
  return request;
}

function ensureFile(): void {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, DepositRequest> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, DepositRequest>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, DepositRequest>): void {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
