import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '../logger.js';
import { pgEnabled, postgresExecutor, withPostgresTransaction } from './client.js';
import type { SqlExecutor } from './migrations.js';
import type { DirectDeal } from './deals.js';
import { termsDigest } from '../deals/termsDigest.js';
import {
  completeInviteClaim as completeClaimState,
  releaseInviteClaim as releaseClaimState,
  reserveInviteClaim as reserveClaimState,
} from '../deals/inviteClaim.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'deal-invites.json');

export interface DealInvite {
  token: string;
  jobId: string;
  role: 'buyer' | 'seller';
  email: string;
  termsDigest?: string;
  expiresAt: number;
  usedAt?: number;
  usedByAddress?: string;
  claimingAt?: number;
  claimingByAddress?: string;
  claimLeaseUntil?: number;
  createdAt: number;
}

interface InviteRow extends Record<string, unknown> { data: DealInvite }

const store = new Map<string, DealInvite>();
let loaded = false;
let legacyImport: Promise<void> | null = null;

export function legacyInvitesForImport(invites: readonly DealInvite[]): DealInvite[] {
  const used = invites.filter((invite) => invite.usedAt != null);
  const newestPendingByJob = new Map<string, DealInvite>();
  for (const invite of invites.filter((candidate) => candidate.usedAt == null)) {
    const key = invite.jobId.toLowerCase();
    const current = newestPendingByJob.get(key);
    if (!current || invite.createdAt > current.createdAt) newestPendingByJob.set(key, invite);
  }
  return [...used, ...newestPendingByJob.values()];
}

async function ensureLegacyImported(): Promise<void> {
  legacyImport ??= (async () => {
    if (!existsSync(STORE_PATH)) return;
    let invites: DealInvite[];
    try {
      invites = legacyInvitesForImport(
        Object.values(JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, DealInvite>),
      );
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'legacy deal invite import could not read the source file');
      throw err;
    }
    for (const invite of invites) {
      await postgresExecutor().query(
        `INSERT INTO deal_invites_v1 (token, job_id, email, expires_at, used_at, data)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT DO NOTHING`,
        [invite.token, invite.jobId.toLowerCase(), invite.email.toLowerCase(), invite.expiresAt, invite.usedAt ?? null, JSON.stringify(invite)],
      );
    }
    if (invites.length > 0) logger.info({ count: invites.length }, 'legacy deal invites imported into Postgres');
  })();
  await legacyImport;
}

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(STORE_PATH)) return;
  try {
    const obj = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, DealInvite>;
    for (const [key, invite] of Object.entries(obj)) store.set(key, invite);
    logger.info({ count: store.size }, 'deal invites loaded from disk');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'deal invites load failed, starting empty');
  }
}

function persist(): void {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(Object.fromEntries(store), null, 2), 'utf8');
}

async function findByToken(executor: SqlExecutor, token: string, lock = false): Promise<DealInvite | null> {
  const result = await executor.query<InviteRow>(
    `SELECT data FROM deal_invites_v1 WHERE token = $1${lock ? ' FOR UPDATE' : ''}`,
    [token],
  );
  return result.rows[0]?.data ?? null;
}

async function writeInvite(executor: SqlExecutor, invite: DealInvite): Promise<void> {
  await executor.query(
    `UPDATE deal_invites_v1
     SET job_id = $2, email = $3, expires_at = $4, used_at = $5, data = $6::jsonb
     WHERE token = $1`,
    [invite.token, invite.jobId.toLowerCase(), invite.email, invite.expiresAt, invite.usedAt ?? null, JSON.stringify(invite)],
  );
}

export async function createInvite(input: Omit<DealInvite, 'createdAt'>): Promise<DealInvite> {
  const invite: DealInvite = { ...input, jobId: input.jobId.toLowerCase(), email: input.email.toLowerCase(), createdAt: Date.now() };
  if (pgEnabled) {
    await ensureLegacyImported();
    await postgresExecutor().query(
      `INSERT INTO deal_invites_v1 (token, job_id, email, expires_at, used_at, data)
       VALUES ($1, $2, $3, $4, NULL, $5::jsonb)`,
      [invite.token, invite.jobId, invite.email, invite.expiresAt, JSON.stringify(invite)],
    );
    return invite;
  }
  load();
  store.set(invite.token, invite);
  persist();
  return invite;
}

export async function getInvite(token: string): Promise<DealInvite | null> {
  if (pgEnabled) {
    await ensureLegacyImported();
    return findByToken(postgresExecutor(), token);
  }
  load();
  return store.get(token) ?? null;
}

export async function getInviteByJob(jobId: string): Promise<DealInvite | null> {
  if (pgEnabled) {
    await ensureLegacyImported();
    const result = await postgresExecutor().query<InviteRow>(
      `SELECT data FROM deal_invites_v1 WHERE job_id = $1 AND used_at IS NULL LIMIT 1`,
      [jobId.toLowerCase()],
    );
    return result.rows[0]?.data ?? null;
  }
  load();
  return [...store.values()].find((invite) => invite.jobId.toLowerCase() === jobId.toLowerCase() && !invite.usedAt) ?? null;
}

export async function refreshInviteTerms(jobId: string, termsDigest: string): Promise<DealInvite | null> {
  if (pgEnabled) {
    await ensureLegacyImported();
    return withPostgresTransaction(async (tx) => {
      const result = await tx.query<InviteRow>(
        `SELECT data FROM deal_invites_v1 WHERE job_id = $1 AND used_at IS NULL LIMIT 1 FOR UPDATE`,
        [jobId.toLowerCase()],
      );
      const current = result.rows[0]?.data;
      if (!current) return null;
      const next = { ...current, termsDigest };
      await writeInvite(tx, next);
      return next;
    });
  }
  load();
  const current = [...store.values()].find((invite) => invite.jobId.toLowerCase() === jobId.toLowerCase() && !invite.usedAt);
  if (!current) return null;
  const next = { ...current, termsDigest };
  store.set(next.token, next);
  persist();
  return next;
}

export type InviteClaimResult =
  | { ok: true; invite: DealInvite }
  | { ok: false; code: 'NOT_FOUND' | 'CLAIMED' | 'IN_PROGRESS' };

export async function reserveInviteClaim(token: string, address: string, now = Date.now()): Promise<InviteClaimResult> {
  if (pgEnabled) {
    await ensureLegacyImported();
    return withPostgresTransaction(async (tx) => {
      const invite = await findByToken(tx, token, true);
      if (!invite) return { ok: false, code: 'NOT_FOUND' };
      const result = reserveClaimState(invite, address, now);
      if (!result.ok) return result;
      const next = { ...invite, ...result.next };
      await writeInvite(tx, next);
      return { ok: true, invite: next };
    });
  }
  load();
  const invite = store.get(token);
  if (!invite) return { ok: false, code: 'NOT_FOUND' };
  const result = reserveClaimState(invite, address, now);
  if (!result.ok) return result;
  const next = { ...invite, ...result.next };
  store.set(token, next);
  try { persist(); } catch (err) {
    store.set(token, invite);
    logger.error({ err: (err as Error).message, token }, 'invite claim reservation failed');
    return { ok: false, code: 'IN_PROGRESS' };
  }
  return { ok: true, invite: next };
}

export async function completeInviteClaim(token: string, address: string, now = Date.now()): Promise<DealInvite | null> {
  return mutateClaim(token, (invite) => {
    const state = completeClaimState(invite, address, now);
    return state ? { ...invite, ...state } : null;
  });
}

export async function bindInviteClaimToDeal(input: {
  token: string;
  address: string;
  pendingAddress: string;
  patch: Partial<DirectDeal>;
  now?: number;
}): Promise<{ invite: DealInvite; deal: DirectDeal } | null> {
  if (!pgEnabled) return null;
  await ensureLegacyImported();
  return withPostgresTransaction(async (tx) => {
    const invite = await findByToken(tx, input.token, true);
    if (!invite) return null;
    const dealResult = await tx.query<Record<string, unknown> & { data: DirectDeal }>(
      'SELECT data FROM direct_deals WHERE job_id = $1 FOR UPDATE',
      [invite.jobId.toLowerCase()],
    );
    const current = dealResult.rows[0]?.data;
    if (!current) return null;
    if (invite.termsDigest && invite.termsDigest !== termsDigest(current.terms)) return null;

    const claimant = input.address.toLowerCase();
    const currentCounterparty = invite.role === 'seller' ? current.seller : current.buyer;
    if (currentCounterparty !== input.pendingAddress && currentCounterparty !== claimant) return null;
    const nextDeal: DirectDeal = currentCounterparty === claimant
      ? current
      : { ...current, ...input.patch, updatedAt: input.now ?? Date.now() };
    const nextState = completeClaimState(invite, claimant, input.now ?? Date.now());
    if (!nextState) return null;
    const nextInvite = { ...invite, ...nextState };

    if (currentCounterparty !== claimant) {
      await tx.query(
        'UPDATE direct_deals SET buyer = $2, seller = $3, data = $4::jsonb WHERE job_id = $1',
        [invite.jobId.toLowerCase(), nextDeal.buyer, nextDeal.seller, JSON.stringify(nextDeal)],
      );
    }
    await writeInvite(tx, nextInvite);
    return { invite: nextInvite, deal: nextDeal };
  });
}

export async function releaseInviteClaim(token: string, address: string): Promise<DealInvite | null> {
  return mutateClaim(token, (invite) => {
    const state = releaseClaimState(invite, address);
    return state ? { ...invite, ...state } : null;
  });
}

async function mutateClaim(token: string, mutate: (invite: DealInvite) => DealInvite | null): Promise<DealInvite | null> {
  if (pgEnabled) {
    await ensureLegacyImported();
    return withPostgresTransaction(async (tx) => {
      const invite = await findByToken(tx, token, true);
      if (!invite) return null;
      const next = mutate(invite);
      if (!next) return null;
      await writeInvite(tx, next);
      return next;
    });
  }
  load();
  const invite = store.get(token);
  if (!invite) return null;
  const next = mutate(invite);
  if (!next) return null;
  store.set(token, next);
  persist();
  return next;
}

export async function pruneStale(): Promise<number> {
  const now = Date.now();
  const cutoff = now - 30 * 86_400_000;
  if (pgEnabled) {
    await ensureLegacyImported();
    const result = await postgresExecutor().query<Record<string, unknown> & { token: string }>(
      `DELETE FROM deal_invites_v1 WHERE (used_at IS NOT NULL AND used_at < $1) OR (used_at IS NULL AND expires_at < $2) RETURNING token`,
      [cutoff, now],
    );
    return result.rows.length;
  }
  load();
  let removed = 0;
  for (const [key, invite] of store.entries()) {
    if ((invite.usedAt && invite.usedAt < cutoff) || (!invite.usedAt && invite.expiresAt < now)) {
      store.delete(key);
      removed += 1;
    }
  }
  if (removed > 0) persist();
  return removed;
}
