import { parseUsdcMicro } from '../matching/money.js';
import type { SqlExecutor } from '../db/migrations.js';
import type { TransactionRunner } from '../events/domainEventStore.js';

export type ResearchCreditReservationState = 'reserved' | 'settled' | 'released';

export interface ResearchCreditAccountRecord {
  owner: string;
  balanceMicros: string;
  reservedMicros: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  data: Readonly<Record<string, unknown>>;
}

export interface ResearchCreditReservationRecord {
  id: string;
  reservationKey: string;
  owner: string;
  amountMicros: string;
  state: ResearchCreditReservationState;
  version: number;
  createdAt: number;
  updatedAt: number;
  data: Readonly<Record<string, unknown>>;
}

export interface ResearchCreditAuditStore {
  listAccounts(input?: {
    owner?: string;
    limit?: number;
  }): Promise<readonly ResearchCreditAccountRecord[]>;
  listReservations(input?: {
    owner?: string;
    state?: ResearchCreditReservationState;
    limit?: number;
  }): Promise<readonly ResearchCreditReservationRecord[]>;
}

export class ResearchCreditConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchCreditConflictError';
  }
}

export class ResearchCreditInsufficientError extends ResearchCreditConflictError {
  constructor(owner: string, amountMicros: string, availableMicros: string) {
    super(`research credit insufficient for ${owner}: need ${amountMicros}, available ${availableMicros}`);
    this.name = 'ResearchCreditInsufficientError';
  }
}

export class ResearchCreditDuplicateError extends Error {
  constructor(boundary: string) {
    super(`duplicate research credit boundary: ${boundary}`);
    this.name = 'ResearchCreditDuplicateError';
  }
}

export interface ResearchCreditStore extends ResearchCreditAuditStore {
  ensureAccount(input: {
    owner: string;
    initialCreditUsdc: string;
    data?: Readonly<Record<string, unknown>>;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; created: boolean }>;
  getAccount(owner: string): Promise<ResearchCreditAccountRecord | null>;
  getReservation(reservationKey: string): Promise<ResearchCreditReservationRecord | null>;
  reserve(input: {
    id: string;
    reservationKey: string;
    owner: string;
    amountUsdc: string;
    data?: Readonly<Record<string, unknown>>;
    now?: number;
  }): Promise<{
    account: ResearchCreditAccountRecord;
    reservation: ResearchCreditReservationRecord;
    created: boolean;
  }>;
  settle(input: {
    reservationKey: string;
    expectedVersion: number;
    spentUsdc?: string;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; reservation: ResearchCreditReservationRecord }>;
  release(input: {
    reservationKey: string;
    expectedVersion: number;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; reservation: ResearchCreditReservationRecord }>;
}

interface StoredAccount extends ResearchCreditAccountRecord {}
interface StoredReservation extends ResearchCreditReservationRecord {}

function ownerKey(owner: string): string {
  const value = owner.trim();
  if (!value) throw new ResearchCreditConflictError('research credit owner is required');
  return /^0x[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : value;
}

function amountMicros(value: string): bigint {
  const amount = parseUsdcMicro(value);
  if (amount <= 0n) throw new ResearchCreditConflictError('research credit amount must be positive');
  return amount;
}

function nowValue(now?: number): number {
  return now ?? Date.now();
}

function auditLimit(limit?: number): number {
  return Math.min(500, Math.max(1, Math.trunc(limit ?? 100)));
}

function accountWith(
  account: StoredAccount,
  patch: Partial<Pick<StoredAccount, 'balanceMicros' | 'reservedMicros' | 'data'>>,
  now: number,
): StoredAccount {
  return {
    ...account,
    ...patch,
    version: account.version + 1,
    updatedAt: now,
  };
}

function reservationWith(
  reservation: StoredReservation,
  state: ResearchCreditReservationState,
  now: number,
): StoredReservation {
  return { ...reservation, state, version: reservation.version + 1, updatedAt: now };
}

function assertReservationOwnerAndAmount(
  reservation: StoredReservation,
  owner: string,
  amount: bigint,
): void {
  if (reservation.owner !== owner || BigInt(reservation.amountMicros) !== amount) {
    throw new ResearchCreditDuplicateError(`research_credit.reservation:${reservation.reservationKey}`);
  }
}

function settleAmount(reservation: StoredReservation, spentUsdc?: string): bigint {
  const reserved = BigInt(reservation.amountMicros);
  const spent = spentUsdc === undefined ? reserved : amountMicros(spentUsdc);
  if (spent > reserved) {
    throw new ResearchCreditConflictError('research credit settlement exceeds reservation');
  }
  return spent;
}

export class InMemoryResearchCreditStore implements ResearchCreditStore {
  private readonly accounts = new Map<string, StoredAccount>();
  private readonly reservations = new Map<string, StoredReservation>();

  async ensureAccount(input: {
    owner: string;
    initialCreditUsdc: string;
    data?: Readonly<Record<string, unknown>>;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; created: boolean }> {
    const owner = ownerKey(input.owner);
    const existing = this.accounts.get(owner);
    if (existing) return { account: existing, created: false };
    const credit = amountMicros(input.initialCreditUsdc);
    const now = nowValue(input.now);
    const account: StoredAccount = {
      owner,
      balanceMicros: credit.toString(),
      reservedMicros: '0',
      version: 1,
      createdAt: now,
      updatedAt: now,
      data: input.data ?? {},
    };
    this.accounts.set(owner, account);
    return { account, created: true };
  }

  async getAccount(owner: string): Promise<ResearchCreditAccountRecord | null> {
    return this.accounts.get(ownerKey(owner)) ?? null;
  }

  async getReservation(reservationKey: string): Promise<ResearchCreditReservationRecord | null> {
    return this.reservations.get(reservationKey) ?? null;
  }

  async listAccounts(input: { owner?: string; limit?: number } = {}): Promise<readonly ResearchCreditAccountRecord[]> {
    const owner = input.owner ? ownerKey(input.owner) : undefined;
    return [...this.accounts.values()]
      .filter((account) => !owner || account.owner === owner)
      .sort((left, right) => left.owner.localeCompare(right.owner))
      .slice(0, auditLimit(input.limit));
  }

  async listReservations(input: { owner?: string; state?: ResearchCreditReservationState; limit?: number } = {}): Promise<readonly ResearchCreditReservationRecord[]> {
    const owner = input.owner ? ownerKey(input.owner) : undefined;
    const unique = new Map<string, StoredReservation>();
    for (const reservation of this.reservations.values()) unique.set(reservation.reservationKey, reservation);
    return [...unique.values()]
      .filter((reservation) => !owner || reservation.owner === owner)
      .filter((reservation) => !input.state || reservation.state === input.state)
      .sort((left, right) => right.updatedAt - left.updatedAt || left.reservationKey.localeCompare(right.reservationKey))
      .slice(0, auditLimit(input.limit));
  }

  async reserve(input: {
    id: string;
    reservationKey: string;
    owner: string;
    amountUsdc: string;
    data?: Readonly<Record<string, unknown>>;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; reservation: ResearchCreditReservationRecord; created: boolean }> {
    const owner = ownerKey(input.owner);
    const amount = amountMicros(input.amountUsdc);
    const existing = this.reservations.get(input.reservationKey);
    if (existing) {
      assertReservationOwnerAndAmount(existing, owner, amount);
      const account = this.accounts.get(owner);
      if (!account) throw new ResearchCreditConflictError(`research credit account missing: ${owner}`);
      return { account, reservation: existing, created: false };
    }
    const account = this.accounts.get(owner);
    if (!account) throw new ResearchCreditConflictError(`research credit account missing: ${owner}`);
    const available = BigInt(account.balanceMicros) - BigInt(account.reservedMicros);
    if (available < amount) throw new ResearchCreditInsufficientError(owner, amount.toString(), available.toString());
    const now = nowValue(input.now);
    const reservation: StoredReservation = {
      id: input.id,
      reservationKey: input.reservationKey,
      owner,
      amountMicros: amount.toString(),
      state: 'reserved',
      version: 1,
      createdAt: now,
      updatedAt: now,
      data: input.data ?? {},
    };
    if (this.reservations.has(input.id)) throw new ResearchCreditDuplicateError(`research_credit.id:${input.id}`);
    this.reservations.set(input.reservationKey, reservation);
    this.reservations.set(input.id, reservation);
    const updated = accountWith(account, { reservedMicros: (BigInt(account.reservedMicros) + amount).toString() }, now);
    this.accounts.set(owner, updated);
    return { account: updated, reservation, created: true };
  }

  private findReservation(key: string): StoredReservation {
    const reservation = this.reservations.get(key);
    if (!reservation) throw new ResearchCreditConflictError(`unknown research credit reservation: ${key}`);
    return reservation;
  }

  async settle(input: {
    reservationKey: string;
    expectedVersion: number;
    spentUsdc?: string;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; reservation: ResearchCreditReservationRecord }> {
    const reservation = this.findReservation(input.reservationKey);
    const account = this.accounts.get(reservation.owner);
    if (!account) throw new ResearchCreditConflictError(`research credit account missing: ${reservation.owner}`);
    if (reservation.state !== 'reserved') return { account, reservation };
    if (reservation.version !== input.expectedVersion) throw new ResearchCreditConflictError(`stale research credit reservation ${reservation.reservationKey}`);
    const spent = settleAmount(reservation, input.spentUsdc);
    const now = nowValue(input.now);
    const nextReservation = reservationWith(reservation, 'settled', now);
    const nextAccount = accountWith(account, {
      balanceMicros: (BigInt(account.balanceMicros) - spent).toString(),
      reservedMicros: (BigInt(account.reservedMicros) - BigInt(reservation.amountMicros)).toString(),
    }, now);
    this.reservations.set(reservation.reservationKey, nextReservation);
    this.reservations.set(reservation.id, nextReservation);
    this.accounts.set(reservation.owner, nextAccount);
    return { account: nextAccount, reservation: nextReservation };
  }

  async release(input: {
    reservationKey: string;
    expectedVersion: number;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; reservation: ResearchCreditReservationRecord }> {
    const reservation = this.findReservation(input.reservationKey);
    const account = this.accounts.get(reservation.owner);
    if (!account) throw new ResearchCreditConflictError(`research credit account missing: ${reservation.owner}`);
    if (reservation.state !== 'reserved') return { account, reservation };
    if (reservation.version !== input.expectedVersion) throw new ResearchCreditConflictError(`stale research credit reservation ${reservation.reservationKey}`);
    const now = nowValue(input.now);
    const nextReservation = reservationWith(reservation, 'released', now);
    const nextAccount = accountWith(account, {
      reservedMicros: (BigInt(account.reservedMicros) - BigInt(reservation.amountMicros)).toString(),
    }, now);
    this.reservations.set(reservation.reservationKey, nextReservation);
    this.reservations.set(reservation.id, nextReservation);
    this.accounts.set(reservation.owner, nextAccount);
    return { account: nextAccount, reservation: nextReservation };
  }
}

interface AccountRow extends Record<string, unknown> {
  owner: string;
  balance_micros: string | number;
  reserved_micros: string | number;
  version: string | number;
  created_at: string | number;
  updated_at: string | number;
  data: Readonly<Record<string, unknown>>;
}

interface ReservationRow extends Record<string, unknown> {
  id: string;
  reservation_key: string;
  owner: string;
  amount_micros: string | number;
  state: ResearchCreditReservationState;
  version: string | number;
  created_at: string | number;
  updated_at: string | number;
  data: Readonly<Record<string, unknown>>;
}

function integer(value: string | number, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`invalid ${label}`);
  return parsed;
}

function accountFrom(row: AccountRow): StoredAccount {
  return {
    owner: row.owner,
    balanceMicros: String(row.balance_micros),
    reservedMicros: String(row.reserved_micros),
    version: integer(row.version, 'research credit account version'),
    createdAt: integer(row.created_at, 'research credit account created_at'),
    updatedAt: integer(row.updated_at, 'research credit account updated_at'),
    data: row.data,
  };
}

function reservationFrom(row: ReservationRow): StoredReservation {
  return {
    id: row.id,
    reservationKey: row.reservation_key,
    owner: row.owner,
    amountMicros: String(row.amount_micros),
    state: row.state,
    version: integer(row.version, 'research credit reservation version'),
    createdAt: integer(row.created_at, 'research credit reservation created_at'),
    updatedAt: integer(row.updated_at, 'research credit reservation updated_at'),
    data: row.data,
  };
}

function reservationParams(input: {
  id: string;
  reservationKey: string;
  owner: string;
  amount: bigint;
  now: number;
  data: Readonly<Record<string, unknown>>;
}): readonly unknown[] {
  return [input.id, input.reservationKey, input.owner, input.amount.toString(), input.now, JSON.stringify(input.data)];
}

export class PostgresResearchCreditStore implements ResearchCreditStore {
  constructor(private readonly executor: SqlExecutor, private readonly transaction: TransactionRunner) {}

  async ensureAccount(input: {
    owner: string;
    initialCreditUsdc: string;
    data?: Readonly<Record<string, unknown>>;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; created: boolean }> {
    const owner = ownerKey(input.owner);
    const credit = amountMicros(input.initialCreditUsdc);
    const now = nowValue(input.now);
    return this.transaction(async (tx) => {
      const inserted = await tx.query<AccountRow>(
        `INSERT INTO research_credit_accounts_v2
          (owner,balance_micros,reserved_micros,version,created_at,updated_at,data)
         VALUES ($1,$2,0,1,$3,$3,$4::jsonb)
         ON CONFLICT (owner) DO NOTHING RETURNING *`,
        [owner, credit.toString(), now, JSON.stringify(input.data ?? {})],
      );
      const row = inserted.rows[0] ?? (await tx.query<AccountRow>('SELECT * FROM research_credit_accounts_v2 WHERE owner = $1', [owner])).rows[0];
      if (!row) throw new Error(`research credit account was not persisted: ${owner}`);
      return { account: accountFrom(row), created: inserted.rows.length > 0 };
    });
  }

  async getAccount(owner: string): Promise<ResearchCreditAccountRecord | null> {
    const row = (await this.executor.query<AccountRow>('SELECT * FROM research_credit_accounts_v2 WHERE owner = $1', [ownerKey(owner)])).rows[0];
    return row ? accountFrom(row) : null;
  }

  async getReservation(reservationKey: string): Promise<ResearchCreditReservationRecord | null> {
    const row = (await this.executor.query<ReservationRow>('SELECT * FROM research_credit_reservations_v2 WHERE reservation_key = $1', [reservationKey])).rows[0];
    return row ? reservationFrom(row) : null;
  }

  async listAccounts(input: { owner?: string; limit?: number } = {}): Promise<readonly ResearchCreditAccountRecord[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (input.owner) {
      params.push(ownerKey(input.owner));
      clauses.push(`owner = $${params.length}`);
    }
    params.push(auditLimit(input.limit));
    const rows = (await this.executor.query<AccountRow>(
      `SELECT * FROM research_credit_accounts_v2${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY owner ASC LIMIT $${params.length}`,
      params,
    )).rows;
    return rows.map(accountFrom);
  }

  async listReservations(input: { owner?: string; state?: ResearchCreditReservationState; limit?: number } = {}): Promise<readonly ResearchCreditReservationRecord[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (input.owner) {
      params.push(ownerKey(input.owner));
      clauses.push(`owner = $${params.length}`);
    }
    if (input.state) {
      params.push(input.state);
      clauses.push(`state = $${params.length}`);
    }
    params.push(auditLimit(input.limit));
    const rows = (await this.executor.query<ReservationRow>(
      `SELECT * FROM research_credit_reservations_v2${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY updated_at DESC, reservation_key ASC LIMIT $${params.length}`,
      params,
    )).rows;
    return rows.map(reservationFrom);
  }

  async reserve(input: {
    id: string;
    reservationKey: string;
    owner: string;
    amountUsdc: string;
    data?: Readonly<Record<string, unknown>>;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; reservation: ResearchCreditReservationRecord; created: boolean }> {
    const owner = ownerKey(input.owner);
    const amount = amountMicros(input.amountUsdc);
    const now = nowValue(input.now);
    return this.transaction(async (tx) => {
      const accountRow = (await tx.query<AccountRow>('SELECT * FROM research_credit_accounts_v2 WHERE owner = $1 FOR UPDATE', [owner])).rows[0];
      if (!accountRow) throw new ResearchCreditConflictError(`research credit account missing: ${owner}`);
      const account = accountFrom(accountRow);
      const existingRow = (await tx.query<ReservationRow>('SELECT * FROM research_credit_reservations_v2 WHERE reservation_key = $1 FOR UPDATE', [input.reservationKey])).rows[0];
      if (existingRow) {
        const existing = reservationFrom(existingRow);
        assertReservationOwnerAndAmount(existing, owner, amount);
        return { account, reservation: existing, created: false };
      }
      const available = BigInt(account.balanceMicros) - BigInt(account.reservedMicros);
      if (available < amount) throw new ResearchCreditInsufficientError(owner, amount.toString(), available.toString());
      const inserted = await tx.query<ReservationRow>(
        `INSERT INTO research_credit_reservations_v2
          (id,reservation_key,owner,amount_micros,state,version,created_at,updated_at,data)
         VALUES ($1,$2,$3,$4,'reserved',1,$5,$5,$6::jsonb) RETURNING *`,
        reservationParams({ id: input.id, reservationKey: input.reservationKey, owner, amount, now, data: input.data ?? {} }),
      );
      const row = inserted.rows[0];
      if (!row) throw new Error(`research credit reservation was not persisted: ${input.reservationKey}`);
      const updatedAccountRow = (await tx.query<AccountRow>(
        `UPDATE research_credit_accounts_v2
            SET reserved_micros = reserved_micros + $2, version = version + 1, updated_at = $3
          WHERE owner = $1 AND version = $4 RETURNING *`,
        [owner, amount.toString(), now, account.version],
      )).rows[0];
      if (!updatedAccountRow) throw new ResearchCreditConflictError(`research credit account update lost: ${owner}`);
      return { account: accountFrom(updatedAccountRow), reservation: reservationFrom(row), created: true };
    });
  }

  private async terminalTransition(
    input: { reservationKey: string; expectedVersion: number; now?: number },
    state: Extract<ResearchCreditReservationState, 'settled' | 'released'>,
    spentUsdc?: string,
  ): Promise<{ account: ResearchCreditAccountRecord; reservation: ResearchCreditReservationRecord }> {
    const now = nowValue(input.now);
    return this.transaction(async (tx) => {
      const reservationRow = (await tx.query<ReservationRow>('SELECT * FROM research_credit_reservations_v2 WHERE reservation_key = $1 FOR UPDATE', [input.reservationKey])).rows[0];
      if (!reservationRow) throw new ResearchCreditConflictError(`unknown research credit reservation: ${input.reservationKey}`);
      const reservation = reservationFrom(reservationRow);
      const accountRow = (await tx.query<AccountRow>('SELECT * FROM research_credit_accounts_v2 WHERE owner = $1 FOR UPDATE', [reservation.owner])).rows[0];
      if (!accountRow) throw new ResearchCreditConflictError(`research credit account missing: ${reservation.owner}`);
      const account = accountFrom(accountRow);
      if (reservation.state !== 'reserved') return { account, reservation };
      if (reservation.version !== input.expectedVersion) throw new ResearchCreditConflictError(`stale research credit reservation ${reservation.reservationKey}`);
      const spent = state === 'settled' ? settleAmount(reservation, spentUsdc) : 0n;
      const updatedReservationRow = (await tx.query<ReservationRow>(
        `UPDATE research_credit_reservations_v2
            SET state = $2, version = version + 1, updated_at = $3
          WHERE reservation_key = $1 AND version = $4 AND state = 'reserved' RETURNING *`,
        [reservation.reservationKey, state, now, input.expectedVersion],
      )).rows[0];
      if (!updatedReservationRow) throw new ResearchCreditConflictError(`research credit reservation update lost: ${reservation.reservationKey}`);
      const updatedAccountRow = (await tx.query<AccountRow>(
        `UPDATE research_credit_accounts_v2
            SET balance_micros = balance_micros - $2, reserved_micros = reserved_micros - $3,
                version = version + 1, updated_at = $4
          WHERE owner = $1 AND version = $5 RETURNING *`,
        [reservation.owner, spent.toString(), reservation.amountMicros, now, account.version],
      )).rows[0];
      if (!updatedAccountRow) throw new ResearchCreditConflictError(`research credit account update lost: ${reservation.owner}`);
      return { account: accountFrom(updatedAccountRow), reservation: reservationFrom(updatedReservationRow) };
    });
  }

  async settle(input: {
    reservationKey: string;
    expectedVersion: number;
    spentUsdc?: string;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; reservation: ResearchCreditReservationRecord }> {
    return this.terminalTransition(input, 'settled', input.spentUsdc);
  }

  async release(input: {
    reservationKey: string;
    expectedVersion: number;
    now?: number;
  }): Promise<{ account: ResearchCreditAccountRecord; reservation: ResearchCreditReservationRecord }> {
    return this.terminalTransition(input, 'released');
  }
}
