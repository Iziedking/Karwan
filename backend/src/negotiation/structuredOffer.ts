import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseUsdcMicro } from '../matching/money.js';

export const NEGOTIATION_SCHEMA_VERSION = 'negotiation-v2.0.0';

const decimalUsdc = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/);
const role = z.enum(['buyer', 'seller']);
const action = z.enum([
  'REVISE_PRICE',
  'REVISE_DELIVERY',
  'REVISE_SCOPE',
  'REVISE_PAYMENT_TERMS',
  'REQUEST_CLARIFICATION',
  'ACCEPT_EXACT_VERSION',
  'WALK_AWAY',
]);

const terms = z.object({
  scope: z.string().trim().min(1).max(2_000),
  delivery: z.string().trim().min(1).max(2_000),
  paymentTerms: z.string().trim().min(1).max(1_000),
}).strict();

export const structuredOfferSchema = z.object({
  dealRoomId: z.string().trim().min(1).max(200),
  offerId: z.string().trim().min(1).max(200),
  offerVersion: z.number().int().positive(),
  senderRole: role,
  recipientRole: role,
  kind: z.enum(['OPENING', 'COUNTER', 'ACCEPTANCE_PROPOSAL']),
  action,
  priceUsdc: decimalUsdc,
  deadlineUnix: z.number().int().positive(),
  buyerMandateVersion: z.number().int().positive(),
  sellerMandateVersion: z.number().int().positive(),
  previousOfferId: z.string().trim().min(1).max(200).optional(),
  previousOfferVersion: z.number().int().positive().optional(),
  terms,
}).strict().superRefine((value, ctx) => {
  if (value.senderRole === value.recipientRole) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientRole'], message: 'sender and recipient roles must differ' });
  }
  if (value.previousOfferId === undefined && value.previousOfferVersion !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['previousOfferVersion'], message: 'previous offer id is required' });
  }
  if (value.previousOfferId !== undefined && value.previousOfferVersion === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['previousOfferVersion'], message: 'previous offer version is required' });
  }
});

export type StructuredOffer = z.infer<typeof structuredOfferSchema>;

export interface NegotiationMandates {
  buyerMaxPriceUsdc: string;
  sellerMinPriceUsdc: string;
  earliestDeadlineUnix?: number;
  latestDeadlineUnix?: number;
  buyerMandateVersion: number;
  sellerMandateVersion: number;
}

export interface ClampedOffer {
  offer: StructuredOffer;
  changedFields: readonly ('priceUsdc' | 'deadlineUnix')[];
  reasons: readonly string[];
}

export function parseStructuredOffer(input: unknown): StructuredOffer {
  return structuredOfferSchema.parse(input);
}

export function clampStructuredOffer(input: unknown, mandates: NegotiationMandates): ClampedOffer {
  const parsed = parseStructuredOffer(input);
  if (parsed.buyerMandateVersion !== mandates.buyerMandateVersion) throw new Error('STALE_BUYER_MANDATE');
  if (parsed.sellerMandateVersion !== mandates.sellerMandateVersion) throw new Error('STALE_SELLER_MANDATE');
  const buyerCap = parseUsdcMicro(mandates.buyerMaxPriceUsdc);
  const sellerFloor = parseUsdcMicro(mandates.sellerMinPriceUsdc);
  if (sellerFloor > buyerCap) throw new Error('MANDATE_PRICE_BOUNDARIES_CONFLICT');

  const proposed = parseUsdcMicro(parsed.priceUsdc);
  const bounded = proposed < sellerFloor ? sellerFloor : proposed > buyerCap ? buyerCap : proposed;
  let deadline = parsed.deadlineUnix;
  const changedFields: ('priceUsdc' | 'deadlineUnix')[] = [];
  const reasons: string[] = [];
  if (bounded !== proposed) {
    changedFields.push('priceUsdc');
    reasons.push(bounded === sellerFloor ? 'PRICE_RAISED_TO_SELLER_FLOOR' : 'PRICE_REDUCED_TO_BUYER_CAP');
  }
  if (mandates.earliestDeadlineUnix !== undefined && deadline < mandates.earliestDeadlineUnix) {
    deadline = mandates.earliestDeadlineUnix;
    changedFields.push('deadlineUnix');
    reasons.push('DEADLINE_RAISED_TO_EARLIEST_ALLOWED');
  }
  if (mandates.latestDeadlineUnix !== undefined && deadline > mandates.latestDeadlineUnix) {
    deadline = mandates.latestDeadlineUnix;
    changedFields.push('deadlineUnix');
    reasons.push('DEADLINE_REDUCED_TO_LATEST_ALLOWED');
  }
  if (mandates.earliestDeadlineUnix !== undefined
    && mandates.latestDeadlineUnix !== undefined
    && mandates.earliestDeadlineUnix > mandates.latestDeadlineUnix) {
    throw new Error('MANDATE_DEADLINE_BOUNDARIES_CONFLICT');
  }
  const offer: StructuredOffer = {
    ...parsed,
    priceUsdc: formatUsdcMicro(bounded),
    deadlineUnix: deadline,
  };
  return { offer, changedFields, reasons };
}

export function formatUsdcMicro(micros: bigint): string {
  const whole = micros / 1_000_000n;
  const fraction = (micros % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

/** A stable terms hash intentionally excludes ids and version pointers. */
export function structuredOfferFingerprint(offer: StructuredOffer): string {
  const { dealRoomId: _dealRoomId, offerId: _offerId, offerVersion: _offerVersion,
    previousOfferId: _previousOfferId, previousOfferVersion: _previousOfferVersion, ...termsOnly } = offer;
  return createHash('sha256').update(JSON.stringify(canonicalize(termsOnly))).digest('hex');
}

export interface AcceptanceCommand {
  commandId: string;
  dealRoomId: string;
  expectedDealRoomVersion: number;
  offerId: string;
  offerVersion: number;
  buyerMandateVersion: number;
  sellerMandateVersion: number;
}

export interface AcceptanceSnapshot {
  dealRoomId: string;
  dealRoomVersion: number;
  activeOfferId: string;
  activeOfferVersion: number;
  buyerMandateVersion: number;
  sellerMandateVersion: number;
}

export type AcceptanceDecision =
  | { outcome: 'accepted'; commandId: string }
  | { outcome: 'stale'; reason: 'STALE_DEAL_ROOM' | 'STALE_OFFER' | 'STALE_BUYER_MANDATE' | 'STALE_SELLER_MANDATE'; current: AcceptanceSnapshot }
  | { outcome: 'invalid'; reason: 'WRONG_DEAL_ROOM' | 'INVALID_VERSION' };

export function validateExactAcceptance(command: AcceptanceCommand, current: AcceptanceSnapshot): AcceptanceDecision {
  if (command.dealRoomId !== current.dealRoomId) return { outcome: 'invalid', reason: 'WRONG_DEAL_ROOM' };
  if (!Number.isInteger(command.expectedDealRoomVersion) || !Number.isInteger(command.offerVersion)) {
    return { outcome: 'invalid', reason: 'INVALID_VERSION' };
  }
  if (command.offerId !== current.activeOfferId || command.offerVersion !== current.activeOfferVersion) {
    return { outcome: 'stale', reason: 'STALE_OFFER', current };
  }
  if (command.expectedDealRoomVersion !== current.dealRoomVersion) {
    return { outcome: 'stale', reason: 'STALE_DEAL_ROOM', current };
  }
  if (command.buyerMandateVersion !== current.buyerMandateVersion) {
    return { outcome: 'stale', reason: 'STALE_BUYER_MANDATE', current };
  }
  if (command.sellerMandateVersion !== current.sellerMandateVersion) {
    return { outcome: 'stale', reason: 'STALE_SELLER_MANDATE', current };
  }
  return { outcome: 'accepted', commandId: command.commandId };
}

export class InMemoryAcceptanceLedger {
  private readonly results = new Map<string, AcceptanceDecision>();

  execute(command: AcceptanceCommand, current: AcceptanceSnapshot): AcceptanceDecision {
    const prior = this.results.get(command.commandId);
    if (prior) return prior;
    const result = validateExactAcceptance(command, current);
    this.results.set(command.commandId, result);
    return result;
  }
}

export type ReengagementTrigger =
  | 'NEW_OFFER'
  | 'TERMS_CHANGED'
  | 'MANDATE_CHANGED'
  | 'STAKE_CONFIRMED'
  | 'FUNDS_CONFIRMED'
  | 'EVIDENCE_IMPROVED'
  | 'CAPACITY_AVAILABLE'
  | 'COOLDOWN_ELAPSED'
  | 'DEADLINE_WINDOW'
  | 'USER_REQUESTED';

export interface ReengagementInput {
  trigger: ReengagementTrigger;
  triggerReference: string;
  nowUnix: number;
  attemptCount: number;
  maxAttempts: number;
  cooldownUntilUnix?: number;
  currentFingerprint: string;
  previousFingerprint?: string;
  explicitDoNotReengage?: boolean;
  /**
   * Optional policy accounting for the bounded negotiation budget. Values are
   * decimal USDC strings and are compared in micro-units, never with floats.
   * The fields stay optional so legacy callers can characterize the policy
   * without changing their authority or runtime behavior.
   */
  negotiationSpendUsdc?: string;
  negotiationSpendCapUsdc?: string;
  nextAttemptCostUsdc?: string;
}

export type ReengagementDecision =
  | { outcome: 'schedule'; key: string }
  | {
      outcome: 'suppress';
      reason: 'ATTEMPT_CAP' | 'COOLDOWN' | 'NO_MATERIAL_CHANGE' | 'DO_NOT_REENGAGE' | 'SPEND_CAP';
    };

export function decideReengagement(input: ReengagementInput): ReengagementDecision {
  if (input.explicitDoNotReengage) return { outcome: 'suppress', reason: 'DO_NOT_REENGAGE' };
  if (input.attemptCount >= input.maxAttempts) return { outcome: 'suppress', reason: 'ATTEMPT_CAP' };
  if (input.cooldownUntilUnix !== undefined && input.cooldownUntilUnix > input.nowUnix) {
    return { outcome: 'suppress', reason: 'COOLDOWN' };
  }
  if (input.previousFingerprint !== undefined && input.previousFingerprint === input.currentFingerprint
    && input.trigger !== 'USER_REQUESTED') {
    return { outcome: 'suppress', reason: 'NO_MATERIAL_CHANGE' };
  }
  if (input.negotiationSpendCapUsdc !== undefined) {
    const spent = parseUsdcMicro(input.negotiationSpendUsdc ?? '0');
    const cap = parseUsdcMicro(input.negotiationSpendCapUsdc);
    const nextCost = parseUsdcMicro(input.nextAttemptCostUsdc ?? '0');
    if (spent > cap || spent + nextCost > cap) {
      return { outcome: 'suppress', reason: 'SPEND_CAP' };
    }
  }
  return { outcome: 'schedule', key: `${input.trigger}:${input.triggerReference}` };
}
