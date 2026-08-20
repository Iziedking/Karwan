import { createHash, randomBytes } from 'node:crypto';

export const USDC_DECIMALS = 6;
export const KARWAN_REFERENCE_PREFIX = 'KWN';
export const KARWAN_REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const REFERENCE_BODY_LENGTH = 12;
const REJECTION_LIMIT =
  Math.floor(256 / KARWAN_REFERENCE_ALPHABET.length) * KARWAN_REFERENCE_ALPHABET.length;

export type MoneyMovementKind =
  | 'escrow_funding'
  | 'milestone_payout'
  | 'escrow_refund'
  | 'deposit'
  | 'bridge'
  | 'cash_out'
  | 'financing_advance'
  | 'financing_repayment';

export type MoneyMovementState =
  | 'created'
  | 'preparing'
  | 'submitted'
  | 'verifying'
  | 'completed'
  | 'needs_attention'
  | 'cancelled';

export type MoneyMovementActor = 'buyer' | 'seller' | 'counterparty' | 'karwan' | 'support' | 'none';

export type MoneyMovementPartyRole =
  | 'owner'
  | 'buyer'
  | 'seller'
  | 'counterparty'
  | 'financier'
  | 'recipient'
  | 'source';

export type MoneyMovementRail =
  | 'circle_wallets'
  | 'arc_contract'
  | 'gateway'
  | 'cctp'
  | 'database';

export type MoneyMovementLegState =
  | 'planned'
  | 'submitted'
  | 'confirmed'
  | 'verified'
  | 'failed';

export interface MoneyMovementParty {
  address: string;
  role: MoneyMovementPartyRole;
}

export interface MoneyMovementLeg {
  id: string;
  key: string;
  attempt: number;
  label: string;
  rail: MoneyMovementRail;
  state: MoneyMovementLegState;
  idempotencyKey: string;
  walletId?: string;
  signerAddress?: string;
  sourceAddress?: string;
  destinationAddress?: string;
  contractAddress?: string;
  amountMicros?: string;
  providerId?: string;
  txHash?: string;
  explorerUrl?: string;
  failureCode?: string;
  createdAt: number;
  submittedAt?: number;
  confirmedAt?: number;
  verifiedAt?: number;
  failedAt?: number;
}

export interface MoneyMovement {
  reference: string;
  operationKey: string;
  kind: MoneyMovementKind;
  state: MoneyMovementState;
  version: number;
  attempt: number;
  currency: 'USDC';
  amountMicros: string;
  initiatedBy: string;
  participants: MoneyMovementParty[];
  summary: string;
  nextActor: MoneyMovementActor;
  expectedArrivalAt?: number;
  jobId?: string;
  milestoneIndex?: number;
  failureCode?: string;
  legs: MoneyMovementLeg[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  cancelledAt?: number;
}

export interface CreateMoneyMovementInput {
  operationKey: string;
  kind: MoneyMovementKind;
  amountMicros: bigint | string;
  initiatedBy: string;
  participants: MoneyMovementParty[];
  summary: string;
  nextActor?: MoneyMovementActor;
  expectedArrivalAt?: number;
  jobId?: string;
  milestoneIndex?: number;
}

const MOVEMENT_TRANSITIONS: Record<MoneyMovementState, ReadonlySet<MoneyMovementState>> = {
  created: new Set(['preparing', 'needs_attention', 'cancelled']),
  preparing: new Set(['submitted', 'verifying', 'needs_attention', 'cancelled']),
  submitted: new Set(['preparing', 'verifying', 'needs_attention']),
  verifying: new Set(['preparing', 'submitted', 'completed', 'needs_attention']),
  completed: new Set(),
  needs_attention: new Set(['preparing', 'cancelled']),
  cancelled: new Set(),
};

const LEG_TRANSITIONS: Record<MoneyMovementLegState, ReadonlySet<MoneyMovementLegState>> = {
  planned: new Set(['submitted', 'failed']),
  submitted: new Set(['confirmed', 'failed']),
  confirmed: new Set(['verified', 'failed']),
  verified: new Set(),
  failed: new Set(),
};

function groupReference(body: string): string {
  return `${KARWAN_REFERENCE_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/**
 * Formats caller-provided entropy into a Karwan reference. Primarily useful for
 * deterministic tests. Bytes outside the rejection range are skipped so every
 * allowed character has the same probability.
 */
export function formatKarwanReference(entropy: Uint8Array): string {
  let body = '';
  for (const byte of entropy) {
    if (byte >= REJECTION_LIMIT) continue;
    body += KARWAN_REFERENCE_ALPHABET[byte % KARWAN_REFERENCE_ALPHABET.length];
    if (body.length === REFERENCE_BODY_LENGTH) return groupReference(body);
  }
  throw new Error('not enough accepted entropy to create a Karwan reference');
}

/** A random, non-sequential, speakable support reference. */
export function createKarwanReference(): string {
  const accepted: number[] = [];
  while (accepted.length < REFERENCE_BODY_LENGTH) {
    for (const byte of randomBytes(REFERENCE_BODY_LENGTH * 2)) {
      if (byte < REJECTION_LIMIT) accepted.push(byte);
      if (accepted.length === REFERENCE_BODY_LENGTH) break;
    }
  }
  return formatKarwanReference(Uint8Array.from(accepted));
}

export function isKarwanReference(value: string): boolean {
  const chars = KARWAN_REFERENCE_ALPHABET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${KARWAN_REFERENCE_PREFIX}-[${chars}]{4}-[${chars}]{4}-[${chars}]{4}$`).test(value);
}

export function parseUsdcMicros(value: string): bigint {
  const normalized = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(normalized);
  if (!match) throw new Error('USDC amount must be a non-negative decimal with at most 6 places');
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? '').padEnd(USDC_DECIMALS, '0'));
  return whole * 10n ** BigInt(USDC_DECIMALS) + fraction;
}

export function formatUsdcMicros(value: bigint | string): string {
  const micros = typeof value === 'bigint' ? value : BigInt(value);
  if (micros < 0n) throw new Error('USDC amount cannot be negative');
  const scale = 10n ** BigInt(USDC_DECIMALS);
  const whole = micros / scale;
  const fraction = (micros % scale).toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function movementIdempotencyKey(reference: string, attempt: number, legKey: string): string {
  const digest = createHash('sha256')
    .update(`${reference}:${attempt}:${legKey}`)
    .digest();
  digest[6] = (digest[6]! & 0x0f) | 0x40;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function createMoneyMovement(
  reference: string,
  input: CreateMoneyMovementInput,
  now = Date.now(),
): MoneyMovement {
  if (!isKarwanReference(reference)) throw new Error('invalid Karwan reference');
  if (!input.operationKey.trim()) throw new Error('operation key is required');
  if (!input.summary.trim()) throw new Error('movement summary is required');
  const amountMicros = BigInt(input.amountMicros);
  if (amountMicros < 0n) throw new Error('movement amount cannot be negative');
  const participants = dedupeParties(input.participants);
  if (participants.length === 0) throw new Error('movement requires at least one participant');
  return {
    reference,
    operationKey: input.operationKey,
    kind: input.kind,
    state: 'created',
    version: 1,
    attempt: 0,
    currency: 'USDC',
    amountMicros: amountMicros.toString(),
    initiatedBy: normalizeAddress(input.initiatedBy),
    participants,
    summary: input.summary.trim(),
    nextActor: input.nextActor ?? 'karwan',
    ...(input.expectedArrivalAt ? { expectedArrivalAt: input.expectedArrivalAt } : {}),
    ...(input.jobId ? { jobId: input.jobId.toLowerCase() } : {}),
    ...(input.milestoneIndex != null ? { milestoneIndex: input.milestoneIndex } : {}),
    legs: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function canTransitionMovement(from: MoneyMovementState, to: MoneyMovementState): boolean {
  return from === to || MOVEMENT_TRANSITIONS[from].has(to);
}

export function transitionMoneyMovement(
  movement: MoneyMovement,
  nextState: MoneyMovementState,
  patch: Partial<Omit<MoneyMovement, 'reference' | 'operationKey' | 'kind' | 'createdAt' | 'state' | 'version'>> = {},
  now = Date.now(),
): MoneyMovement {
  if (!canTransitionMovement(movement.state, nextState)) {
    throw new Error(`invalid movement transition ${movement.state} -> ${nextState}`);
  }
  const next: MoneyMovement = {
    ...movement,
    ...patch,
    reference: movement.reference,
    operationKey: movement.operationKey,
    kind: movement.kind,
    state: nextState,
    version: movement.version + 1,
    createdAt: movement.createdAt,
    updatedAt: now,
  };
  if (nextState === 'completed') {
    next.completedAt = patch.completedAt ?? movement.completedAt ?? now;
    next.nextActor = 'none';
    delete next.expectedArrivalAt;
    delete next.failureCode;
  }
  if (nextState === 'cancelled') {
    next.cancelledAt = patch.cancelledAt ?? movement.cancelledAt ?? now;
    next.nextActor = 'none';
    delete next.expectedArrivalAt;
  }
  return next;
}

export function startMoneyMovementAttempt(movement: MoneyMovement, now = Date.now()): MoneyMovement {
  if (movement.state !== 'created' && movement.state !== 'needs_attention') {
    throw new Error(`cannot start an attempt from ${movement.state}`);
  }
  return transitionMoneyMovement(
    movement,
    'preparing',
    { attempt: movement.attempt + 1, nextActor: 'karwan', failureCode: undefined },
    now,
  );
}

/**
 * Unknown provider outcomes must retain the current attempt and idempotency
 * keys. Only a terminally failed leg makes a fresh attempt safe.
 */
export function shouldReuseMoneyMovementAttempt(movement: MoneyMovement): boolean {
  const currentAttemptLegs = movement.legs.filter((leg) => leg.attempt === movement.attempt);
  return currentAttemptLegs.length > 0 && currentAttemptLegs.every((leg) => leg.state !== 'failed');
}

export interface PlanMovementLegInput {
  key: string;
  label: string;
  rail: MoneyMovementRail;
  walletId?: string;
  signerAddress?: string;
  sourceAddress?: string;
  destinationAddress?: string;
  contractAddress?: string;
  amountMicros?: bigint | string;
}

export function planMoneyMovementLeg(
  movement: MoneyMovement,
  input: PlanMovementLegInput,
  now = Date.now(),
): MoneyMovement {
  if (movement.attempt < 1) throw new Error('start a movement attempt before planning a leg');
  if (movement.state === 'completed' || movement.state === 'cancelled') {
    throw new Error(`cannot add a leg to ${movement.state} movement`);
  }
  const id = `${movement.attempt}:${input.key}`;
  const existing = movement.legs.find((leg) => leg.id === id);
  if (existing) return movement;
  const leg: MoneyMovementLeg = {
    id,
    key: input.key,
    attempt: movement.attempt,
    label: input.label,
    rail: input.rail,
    state: 'planned',
    idempotencyKey: movementIdempotencyKey(movement.reference, movement.attempt, input.key),
    ...(input.walletId ? { walletId: input.walletId } : {}),
    ...(input.signerAddress ? { signerAddress: normalizeAddress(input.signerAddress) } : {}),
    ...(input.sourceAddress ? { sourceAddress: normalizeAddress(input.sourceAddress) } : {}),
    ...(input.destinationAddress ? { destinationAddress: normalizeAddress(input.destinationAddress) } : {}),
    ...(input.contractAddress ? { contractAddress: normalizeAddress(input.contractAddress) } : {}),
    ...(input.amountMicros != null ? { amountMicros: BigInt(input.amountMicros).toString() } : {}),
    createdAt: now,
  };
  return {
    ...movement,
    legs: [...movement.legs, leg],
    version: movement.version + 1,
    updatedAt: now,
  };
}

export function transitionMoneyMovementLeg(
  movement: MoneyMovement,
  legId: string,
  nextState: MoneyMovementLegState,
  patch: Partial<Omit<MoneyMovementLeg, 'id' | 'key' | 'attempt' | 'createdAt' | 'state' | 'idempotencyKey'>> = {},
  now = Date.now(),
): MoneyMovement {
  const index = movement.legs.findIndex((leg) => leg.id === legId);
  if (index < 0) throw new Error(`movement leg not found: ${legId}`);
  const current = movement.legs[index]!;
  if (current.state !== nextState && !LEG_TRANSITIONS[current.state].has(nextState)) {
    throw new Error(`invalid movement leg transition ${current.state} -> ${nextState}`);
  }
  const nextLeg: MoneyMovementLeg = {
    ...current,
    ...patch,
    id: current.id,
    key: current.key,
    attempt: current.attempt,
    state: nextState,
    idempotencyKey: current.idempotencyKey,
    createdAt: current.createdAt,
  };
  if (nextState === 'submitted') nextLeg.submittedAt = patch.submittedAt ?? current.submittedAt ?? now;
  if (nextState === 'confirmed') nextLeg.confirmedAt = patch.confirmedAt ?? current.confirmedAt ?? now;
  if (nextState === 'verified') nextLeg.verifiedAt = patch.verifiedAt ?? current.verifiedAt ?? now;
  if (nextState === 'failed') nextLeg.failedAt = patch.failedAt ?? current.failedAt ?? now;
  const legs = movement.legs.slice();
  legs[index] = nextLeg;
  return { ...movement, legs, version: movement.version + 1, updatedAt: now };
}

/**
 * Advances a provider leg and the user-facing movement state in one versioned
 * update. This is the shape used by Circle lifecycle callbacks, so a submitted
 * transaction ID cannot be persisted while the movement still says created.
 */
export function transitionMoneyMovementAndLeg(
  movement: MoneyMovement,
  nextMovementState: MoneyMovementState,
  legId: string,
  nextLegState: MoneyMovementLegState,
  legPatch: Partial<Omit<MoneyMovementLeg, 'id' | 'key' | 'attempt' | 'createdAt' | 'state' | 'idempotencyKey'>> = {},
  movementPatch: Partial<Omit<MoneyMovement, 'reference' | 'operationKey' | 'kind' | 'createdAt' | 'state' | 'version'>> = {},
  now = Date.now(),
): MoneyMovement {
  if (!canTransitionMovement(movement.state, nextMovementState)) {
    throw new Error(`invalid movement transition ${movement.state} -> ${nextMovementState}`);
  }
  const legged = transitionMoneyMovementLeg(movement, legId, nextLegState, legPatch, now);
  const next: MoneyMovement = {
    ...legged,
    ...movementPatch,
    reference: movement.reference,
    operationKey: movement.operationKey,
    kind: movement.kind,
    state: nextMovementState,
    version: movement.version + 1,
    createdAt: movement.createdAt,
    updatedAt: now,
  };
  if (nextMovementState === 'completed') {
    next.completedAt = movementPatch.completedAt ?? movement.completedAt ?? now;
    next.nextActor = 'none';
    delete next.expectedArrivalAt;
    delete next.failureCode;
  }
  return next;
}

function normalizeAddress(address: string): string {
  const value = address.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : value;
}

function dedupeParties(parties: MoneyMovementParty[]): MoneyMovementParty[] {
  const seen = new Set<string>();
  const out: MoneyMovementParty[] = [];
  for (const party of parties) {
    const address = normalizeAddress(party.address);
    const key = `${address}:${party.role}`;
    if (!address || seen.has(key)) continue;
    seen.add(key);
    out.push({ address, role: party.role });
  }
  return out;
}
