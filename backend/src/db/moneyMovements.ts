import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { moneyMovementParties, moneyMovements } from './schema.js';
import {
  createKarwanReference,
  createMoneyMovement,
  type CreateMoneyMovementInput,
  type MoneyMovement,
} from '../money/model.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'money-movements.json');
const CREATE_ATTEMPTS = 12;
const UPDATE_ATTEMPTS = 8;

interface MovementStore {
  byReference: Record<string, MoneyMovement>;
  byOperationKey: Record<string, string>;
}

export async function getMoneyMovement(reference: string): Promise<MoneyMovement | null> {
  if (pgEnabled) {
    const rows = await db()
      .select({ data: moneyMovements.data })
      .from(moneyMovements)
      .where(eq(moneyMovements.reference, reference.toUpperCase()))
      .limit(1);
    return rows[0]?.data ?? null;
  }
  return loadFile().byReference[reference.toUpperCase()] ?? null;
}

export async function getMoneyMovementByOperationKey(
  operationKey: string,
): Promise<MoneyMovement | null> {
  if (pgEnabled) {
    const rows = await db()
      .select({ data: moneyMovements.data })
      .from(moneyMovements)
      .where(eq(moneyMovements.operationKey, operationKey))
      .limit(1);
    return rows[0]?.data ?? null;
  }
  const store = loadFile();
  const reference = store.byOperationKey[operationKey];
  return reference ? store.byReference[reference] ?? null : null;
}

/**
 * Creates the movement once. A concurrent request using the same operation key
 * receives the winning row. A reference collision retries with new entropy and
 * can never overwrite the existing movement.
 */
export async function ensureMoneyMovement(
  input: CreateMoneyMovementInput,
): Promise<{ movement: MoneyMovement; created: boolean }> {
  const existing = await getMoneyMovementByOperationKey(input.operationKey);
  if (existing) return { movement: existing, created: false };

  if (pgEnabled) {
    for (let i = 0; i < CREATE_ATTEMPTS; i += 1) {
      const movement = createMoneyMovement(createKarwanReference(), input);
      const inserted = await db().transaction(async (tx) => {
        const rows = await tx
          .insert(moneyMovements)
          .values(rowFor(movement))
          .onConflictDoNothing()
          .returning({ reference: moneyMovements.reference });
        if (rows.length === 0) return false;
        await tx.insert(moneyMovementParties).values(
          movement.participants.map((party) => ({
            reference: movement.reference,
            address: party.address.toLowerCase(),
            role: party.role,
            createdAt: movement.createdAt,
          })),
        );
        return true;
      });
      if (inserted) return { movement, created: true };
      const winner = await getMoneyMovementByOperationKey(input.operationKey);
      if (winner) return { movement: winner, created: false };
    }
    throw new Error('could not allocate a unique Karwan reference');
  }

  const store = loadFile();
  const existingReference = store.byOperationKey[input.operationKey];
  if (existingReference) {
    return { movement: store.byReference[existingReference]!, created: false };
  }
  for (let i = 0; i < CREATE_ATTEMPTS; i += 1) {
    const reference = createKarwanReference();
    if (store.byReference[reference]) continue;
    const movement = createMoneyMovement(reference, input);
    store.byReference[reference] = movement;
    store.byOperationKey[input.operationKey] = reference;
    saveFile(store);
    return { movement, created: true };
  }
  throw new Error('could not allocate a unique Karwan reference');
}

/**
 * Compare-and-swap update. Postgres checks the version in the UPDATE predicate,
 * so two workers cannot both advance the same movement from one snapshot.
 */
export async function updateMoneyMovement(
  reference: string,
  mutate: (current: MoneyMovement) => MoneyMovement,
): Promise<MoneyMovement> {
  const key = reference.toUpperCase();
  if (pgEnabled) {
    for (let i = 0; i < UPDATE_ATTEMPTS; i += 1) {
      const current = await getMoneyMovement(key);
      if (!current) throw new Error(`money movement not found: ${key}`);
      const next = validateMutation(current, mutate(current));
      if (next === current || next.version === current.version) return current;
      const rows = await db()
        .update(moneyMovements)
        .set(rowForUpdate(next))
        .where(
          and(
            eq(moneyMovements.reference, key),
            eq(moneyMovements.version, current.version),
          ),
        )
        .returning({ data: moneyMovements.data });
      if (rows[0]) return rows[0].data;
    }
    throw new Error(`money movement update contention: ${key}`);
  }

  const store = loadFile();
  const current = store.byReference[key];
  if (!current) throw new Error(`money movement not found: ${key}`);
  const next = validateMutation(current, mutate(current));
  if (next !== current && next.version !== current.version) {
    store.byReference[key] = next;
    saveFile(store);
  }
  return next;
}

export async function listMoneyMovementsForJobParty(
  jobId: string,
  address: string,
): Promise<MoneyMovement[]> {
  const normalizedJobId = jobId.toLowerCase();
  const normalizedAddress = address.toLowerCase();
  if (pgEnabled) {
    const partyRows = await db()
      .select({ reference: moneyMovementParties.reference })
      .from(moneyMovementParties)
      .where(eq(moneyMovementParties.address, normalizedAddress));
    const references = [...new Set(partyRows.map((row) => row.reference))];
    if (references.length === 0) return [];
    const rows = await db()
      .select({ data: moneyMovements.data })
      .from(moneyMovements)
      .where(
        and(
          eq(moneyMovements.jobId, normalizedJobId),
          inArray(moneyMovements.reference, references),
        ),
      )
      .orderBy(desc(moneyMovements.createdAt));
    return rows.map((row) => row.data);
  }
  return Object.values(loadFile().byReference)
    .filter(
      (movement) =>
        movement.jobId === normalizedJobId &&
        movement.participants.some((party) => party.address.toLowerCase() === normalizedAddress),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Lists every durable movement owned by a signed-in party. The party index is
 * used instead of unpacking movement JSON for every account. This is the read
 * seam shared by the personal ledger and future support tooling.
 */
export async function listMoneyMovementsForAddress(
  address: string,
  limit = 100,
): Promise<MoneyMovement[]> {
  const normalizedAddress = address.toLowerCase();
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit) || 100));
  if (pgEnabled) {
    const partyRows = await db()
      .select({ reference: moneyMovementParties.reference })
      .from(moneyMovementParties)
      .where(eq(moneyMovementParties.address, normalizedAddress))
      .orderBy(desc(moneyMovementParties.createdAt))
      .limit(safeLimit);
    const references = [...new Set(partyRows.map((row) => row.reference))];
    if (references.length === 0) return [];
    const rows = await db()
      .select({ data: moneyMovements.data })
      .from(moneyMovements)
      .where(inArray(moneyMovements.reference, references))
      .orderBy(desc(moneyMovements.updatedAt))
      .limit(safeLimit);
    return rows.map((row) => row.data);
  }
  return Object.values(loadFile().byReference)
    .filter((movement) =>
      movement.participants.some(
        (party) => party.address.toLowerCase() === normalizedAddress,
      ),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, safeLimit);
}

/**
 * Lists all durable movements for a job, including movements whose current
 * participant projection does not yet include the eventual on-chain payee.
 * This is intentionally a bounded, internal reconciliation seam; party-scoped
 * reads should continue using listMoneyMovementsForJobParty instead.
 */
export async function listMoneyMovementsForJob(
  jobId: string,
  limit = 100,
): Promise<MoneyMovement[]> {
  const normalizedJobId = jobId.toLowerCase();
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit) || 100));
  if (pgEnabled) {
    const rows = await db()
      .select({ data: moneyMovements.data })
      .from(moneyMovements)
      .where(eq(moneyMovements.jobId, normalizedJobId))
      .orderBy(desc(moneyMovements.updatedAt))
      .limit(safeLimit);
    return rows.map((row) => row.data);
  }
  return Object.values(loadFile().byReference)
    .filter((movement) => movement.jobId === normalizedJobId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, safeLimit);
}

/// Find an existing financing movement by the transaction it already proved.
/// Older watcher versions used a different operation key for escrow-assigned
/// repayments, so operation-key lookup alone could create a duplicate receipt.
export async function findMoneyMovementByTransfer(input: {
  jobId: string;
  kind: MoneyMovement['kind'];
  txHash: string;
  sourceAddress: string;
  destinationAddress: string;
  amountMicros: bigint | string;
}): Promise<MoneyMovement | null> {
  const amount = BigInt(input.amountMicros).toString();
  const tx = input.txHash.toLowerCase();
  const source = input.sourceAddress.toLowerCase();
  const destination = input.destinationAddress.toLowerCase();
  const movements = await listMoneyMovementsForJob(input.jobId, 200);
  return movements.find((movement) =>
    movement.kind === input.kind &&
    movement.legs.some((leg) =>
      leg.attempt === movement.attempt &&
      leg.txHash?.toLowerCase() === tx &&
      leg.sourceAddress?.toLowerCase() === source &&
      leg.destinationAddress?.toLowerCase() === destination &&
      leg.amountMicros === amount,
    ),
  ) ?? null;
}

/**
 * Find a durable movement by its exact on-chain transfer proof, independent of
 * job ownership.  The balance watcher uses this as a reconciliation guard for
 * wallet-to-wallet credits: a route may already have written the movement,
 * while a watcher replay must never create a second receipt for the same tx.
 */
export async function findMoneyMovementByTransferProof(input: {
  txHash: string;
  sourceAddress: string;
  destinationAddress: string;
  amountMicros: bigint | string;
}): Promise<MoneyMovement | null> {
  const amount = BigInt(input.amountMicros).toString();
  const tx = input.txHash.toLowerCase();
  const source = input.sourceAddress.toLowerCase();
  const destination = input.destinationAddress.toLowerCase();
  const candidates: MoneyMovement[] = pgEnabled
    ? (
        await db()
          .select({ data: moneyMovements.data })
          .from(moneyMovements)
          .orderBy(desc(moneyMovements.updatedAt))
          .limit(1000)
      ).map((row) => row.data)
    : Object.values(loadFile().byReference)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 1000);

  return candidates.find((movement) =>
    transferProofMatchesMovement(movement, {
      txHash: tx,
      sourceAddress: source,
      destinationAddress: destination,
      amountMicros: amount,
    }),
  ) ?? null;
}

/** Exact proof predicate kept pure so reconciliation cannot weaken its match. */
export function transferProofMatchesMovement(
  movement: MoneyMovement,
  input: {
    txHash: string;
    sourceAddress: string;
    destinationAddress: string;
    amountMicros: bigint | string;
  },
): boolean {
  const tx = input.txHash.toLowerCase();
  const source = input.sourceAddress.toLowerCase();
  const destination = input.destinationAddress.toLowerCase();
  const amount = BigInt(input.amountMicros).toString();
  return movement.legs.some((leg) =>
    leg.attempt === movement.attempt &&
    leg.txHash?.toLowerCase() === tx &&
    leg.sourceAddress?.toLowerCase() === source &&
    leg.destinationAddress?.toLowerCase() === destination &&
    leg.amountMicros === amount,
  );
}

/**
 * Find a Gateway deposit by a provider correlation value. Gateway webhooks do
 * not carry a Karwan reference in every event version, so the reconciler may
 * use the submitted transaction id or hash persisted on the current leg.
 * This is intentionally bounded and deposit-only. A missing or ambiguous
 * match is safer than attaching finality to another movement.
 */
export async function findGatewayDepositByCorrelation(
  correlation: string,
): Promise<MoneyMovement | null> {
  const needle = correlation.trim().toLowerCase();
  if (!needle) return null;
  const candidates: MoneyMovement[] = pgEnabled
    ? (
        await db()
          .select({ data: moneyMovements.data })
          .from(moneyMovements)
          .where(eq(moneyMovements.kind, 'deposit'))
          .orderBy(desc(moneyMovements.updatedAt))
          .limit(500)
      ).map((row) => row.data)
    : Object.values(loadFile().byReference)
        .filter((movement) => movement.kind === 'deposit')
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 500);

  const matches = candidates.filter((movement) =>
    movement.legs.some((leg) =>
      [leg.providerId, leg.txHash].some(
        (value) => typeof value === 'string' && value.toLowerCase() === needle,
      ),
    ),
  );
  return matches.length === 1 ? matches[0]! : null;
}

function rowFor(movement: MoneyMovement) {
  return {
    reference: movement.reference,
    operationKey: movement.operationKey,
    kind: movement.kind,
    state: movement.state,
    jobId: movement.jobId ?? null,
    version: movement.version,
    createdAt: movement.createdAt,
    updatedAt: movement.updatedAt,
    data: movement,
  };
}

function rowForUpdate(movement: MoneyMovement) {
  return {
    state: movement.state,
    jobId: movement.jobId ?? null,
    version: movement.version,
    updatedAt: movement.updatedAt,
    data: movement,
  };
}

export function validateMutation(current: MoneyMovement, next: MoneyMovement): MoneyMovement {
  if (next.reference !== current.reference) throw new Error('money movement reference is immutable');
  if (next.operationKey !== current.operationKey) throw new Error('money movement operation key is immutable');
  if (next.kind !== current.kind) throw new Error('money movement kind is immutable');
  if (next.createdAt !== current.createdAt) throw new Error('money movement creation time is immutable');
  // Forward, or not at all. It used to demand EXACTLY one, which no real update
  // satisfies: one logical change walks a leg planned -> submitted -> confirmed
  // -> verified and the movement to `verifying`, and every hop bumps the
  // version, so recording a burn hash on a freshly planned leg arrives here at
  // +4 and threw. That is how a transfer that landed on chain ended up with its
  // leg still `planned`, no hash, and its route aborted before it wrote the
  // bridge projection.
  //
  // Nothing is lost by relaxing it. Optimistic concurrency is enforced by the
  // UPDATE's `where version = current.version` below, not by this arithmetic;
  // what this needs to reject is a mutation that rewinds or stands still while
  // claiming to have changed.
  if (next.version < current.version) {
    throw new Error('money movement version cannot move backwards');
  }
  return next;
}

function ensureFile(): void {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) {
    writeFileSync(STORE_PATH, JSON.stringify({ byReference: {}, byOperationKey: {} }, null, 2), 'utf8');
  }
}

function loadFile(): MovementStore {
  ensureFile();
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Partial<MovementStore>;
    return {
      byReference: parsed.byReference ?? {},
      byOperationKey: parsed.byOperationKey ?? {},
    };
  } catch {
    return { byReference: {}, byOperationKey: {} };
  }
}

function saveFile(store: MovementStore): void {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
