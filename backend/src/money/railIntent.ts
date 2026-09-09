import { createHash, randomUUID } from 'node:crypto';
import { isKarwanReference } from './model.js';

export type MoneyRailKind =
  | 'gateway_deposit'
  | 'cctp_deposit'
  | 'arc_transfer'
  | 'bank_deposit'
  | 'card_onramp'
  | 'bank_withdrawal'
  | 'card_offramp';

export type MoneyRailDirection = 'in' | 'out';
export type MoneyRailStatus =
  | 'created'
  | 'awaiting_provider'
  | 'provider_submitted'
  | 'settlement_pending'
  | 'completed'
  | 'needs_attention'
  | 'cancelled'
  | 'refunded';

export type MoneyRailProviderEvent =
  | { key: string; kind: 'submitted'; providerReference: string }
  | { key: string; kind: 'settlement_pending'; providerReference?: string }
  | {
      key: string;
      kind: 'settled';
      providerReference: string;
      settlementReference: string;
      movementReference?: string;
    }
  | { key: string; kind: 'failed'; failureCode: string }
  | { key: string; kind: 'refunded'; providerReference: string; settlementReference: string };

export interface MoneyRailIntent {
  id: string;
  idempotencyKey: string;
  owner: string;
  thirdPartyPayer?: string;
  rail: MoneyRailKind;
  direction: MoneyRailDirection;
  inputCurrency: string;
  inputAmountMinor: string;
  expectedUsdcMicros?: string;
  recipientAddress?: string;
  sourceChain?: string;
  provider: string;
  status: MoneyRailStatus;
  providerReference?: string;
  settlementReference?: string;
  movementReference?: string;
  failureCode?: string;
  processedEventKeys: string[];
  version: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  cancelledAt?: number;
}

export interface CreateMoneyRailIntentInput {
  owner: string;
  idempotencyKey: string;
  thirdPartyPayer?: string;
  rail: MoneyRailKind;
  direction: MoneyRailDirection;
  inputCurrency: string;
  inputAmountMinor: string | bigint;
  expectedUsdcMicros?: string | bigint;
  recipientAddress?: string;
  sourceChain?: string;
  provider: string;
}

const transitions: Record<MoneyRailStatus, ReadonlySet<MoneyRailStatus>> = {
  created: new Set(['awaiting_provider', 'cancelled']),
  awaiting_provider: new Set(['provider_submitted', 'settlement_pending', 'completed', 'needs_attention', 'cancelled']),
  provider_submitted: new Set(['settlement_pending', 'completed', 'needs_attention']),
  settlement_pending: new Set(['completed', 'needs_attention']),
  needs_attention: new Set(['awaiting_provider', 'provider_submitted', 'settlement_pending', 'cancelled']),
  completed: new Set(['refunded']),
  cancelled: new Set(),
  refunded: new Set(),
};

const supportedRails: Record<MoneyRailKind, { direction: MoneyRailDirection; provider: string }> = {
  gateway_deposit: { direction: 'in', provider: 'circle-gateway' },
  cctp_deposit: { direction: 'in', provider: 'circle-cctp' },
  arc_transfer: { direction: 'out', provider: 'arc-usdc' },
  bank_deposit: { direction: 'in', provider: 'unconfigured' },
  card_onramp: { direction: 'in', provider: 'unconfigured' },
  bank_withdrawal: { direction: 'out', provider: 'unconfigured' },
  card_offramp: { direction: 'out', provider: 'unconfigured' },
};

export function railCapability(
  rail: MoneyRailKind,
  configuredProviders: ReadonlySet<string>,
): {
  rail: MoneyRailKind;
  direction: MoneyRailDirection;
  state: 'live' | 'configured' | 'unavailable';
  provider: string;
} {
  const definition = supportedRails[rail];
  const configured = configuredProviders.has(definition.provider);
  return {
    rail,
    direction: definition.direction,
    state: configured ? (definition.provider === 'unconfigured' ? 'configured' : 'live') : 'unavailable',
    provider: definition.provider,
  };
}

export function railIntentIdempotencyKey(owner: string, clientKey: string): string {
  return createHash('sha256').update(`${owner.trim().toLowerCase()}:${clientKey.trim()}`).digest('hex');
}

export function createMoneyRailIntent(
  input: CreateMoneyRailIntentInput,
  now = Date.now(),
): MoneyRailIntent {
  const definition = supportedRails[input.rail];
  if (definition.direction !== input.direction) {
    throw new Error(`rail ${input.rail} only supports ${definition.direction} movements`);
  }
  if (!input.owner.trim()) throw new Error('rail intent owner is required');
  if (!input.idempotencyKey.trim()) throw new Error('rail intent idempotency key is required');
  if (!input.inputCurrency.trim()) throw new Error('rail intent currency is required');
  const inputAmountMinor = BigInt(input.inputAmountMinor);
  if (inputAmountMinor <= 0n) throw new Error('rail intent amount must be positive');
  const expectedUsdcMicros = input.expectedUsdcMicros == null ? undefined : BigInt(input.expectedUsdcMicros);
  if (expectedUsdcMicros != null && expectedUsdcMicros <= 0n) {
    throw new Error('expected USDC amount must be positive');
  }
  return {
    id: randomUUID(),
    idempotencyKey: input.idempotencyKey,
    owner: input.owner.trim().toLowerCase(),
    ...(input.thirdPartyPayer ? { thirdPartyPayer: input.thirdPartyPayer.trim().toLowerCase() } : {}),
    rail: input.rail,
    direction: input.direction,
    inputCurrency: input.inputCurrency.trim().toUpperCase(),
    inputAmountMinor: inputAmountMinor.toString(),
    ...(expectedUsdcMicros != null ? { expectedUsdcMicros: expectedUsdcMicros.toString() } : {}),
    ...(input.recipientAddress ? { recipientAddress: input.recipientAddress.trim().toLowerCase() } : {}),
    ...(input.sourceChain ? { sourceChain: input.sourceChain.trim() } : {}),
    provider: input.provider.trim(),
    status: 'created',
    processedEventKeys: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function canTransition(from: MoneyRailStatus, to: MoneyRailStatus): boolean {
  return from === to || transitions[from].has(to);
}

function transition(
  intent: MoneyRailIntent,
  status: MoneyRailStatus,
  patch: Partial<MoneyRailIntent>,
  now: number,
): MoneyRailIntent {
  if (!canTransition(intent.status, status)) {
    throw new Error(`invalid rail intent transition ${intent.status} -> ${status}`);
  }
  return {
    ...intent,
    ...patch,
    id: intent.id,
    idempotencyKey: intent.idempotencyKey,
    status,
    version: intent.version + 1,
    updatedAt: now,
    ...(status === 'completed' ? { completedAt: intent.completedAt ?? now } : {}),
    ...(status === 'cancelled' ? { cancelledAt: intent.cancelledAt ?? now } : {}),
  };
}

export function startMoneyRailIntent(intent: MoneyRailIntent, now = Date.now()): MoneyRailIntent {
  if (intent.status !== 'created' && intent.status !== 'needs_attention') {
    throw new Error(`cannot start a rail intent from ${intent.status}`);
  }
  return transition(intent, 'awaiting_provider', { failureCode: undefined }, now);
}

export function cancelMoneyRailIntent(intent: MoneyRailIntent, now = Date.now()): MoneyRailIntent {
  return transition(intent, 'cancelled', { failureCode: undefined }, now);
}

export function applyMoneyRailProviderEvent(
  intent: MoneyRailIntent,
  event: MoneyRailProviderEvent,
  now = Date.now(),
): MoneyRailIntent {
  if (!event.key.trim()) throw new Error('provider event key is required');
  if (intent.processedEventKeys.includes(event.key)) return intent;
  const keys = [...intent.processedEventKeys, event.key].slice(-100);
  switch (event.kind) {
    case 'submitted':
      return transition(intent, 'provider_submitted', {
        providerReference: event.providerReference,
        processedEventKeys: keys,
        failureCode: undefined,
      }, now);
    case 'settlement_pending':
      return transition(intent, 'settlement_pending', {
        ...(event.providerReference ? { providerReference: event.providerReference } : {}),
        processedEventKeys: keys,
        failureCode: undefined,
      }, now);
    case 'settled':
      if (!event.providerReference.trim() || !event.settlementReference.trim()) {
        throw new Error('settled event requires provider and settlement references');
      }
      if (
        (intent.rail === 'gateway_deposit' || intent.rail === 'cctp_deposit' || intent.rail === 'arc_transfer') &&
        (!event.movementReference || !isKarwanReference(event.movementReference))
      ) {
        throw new Error('chain rail settlement requires a Karwan movement reference');
      }
      return transition(intent, 'completed', {
        providerReference: event.providerReference,
        settlementReference: event.settlementReference,
        ...(event.movementReference ? { movementReference: event.movementReference } : {}),
        processedEventKeys: keys,
        failureCode: undefined,
      }, now);
    case 'failed':
      return transition(intent, 'needs_attention', {
        processedEventKeys: keys,
        failureCode: event.failureCode.trim() || 'provider_failed',
      }, now);
    case 'refunded':
      if (!event.providerReference.trim() || !event.settlementReference.trim()) {
        throw new Error('refunded event requires provider and settlement references');
      }
      return transition(intent, 'refunded', {
        providerReference: event.providerReference,
        settlementReference: event.settlementReference,
        processedEventKeys: keys,
        failureCode: undefined,
      }, now);
    default: {
      const neverEvent: never = event;
      return neverEvent;
    }
  }
}
