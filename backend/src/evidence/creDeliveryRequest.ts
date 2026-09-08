import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { DirectDeal } from '../db/deals.js';

const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const shaSchema = z.string().regex(/^[0-9a-fA-F]{40}$/);
const commitmentSchema = bytes32Schema;

export const deliveryRequestInputSchema = z.object({
  termsVersion: z.number().int().positive(),
  evidenceRevision: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  pullNumber: z.number().int().positive(),
  submittedSha: shaSchema,
}).strict();

export const evidenceReceiptBindingInputSchema = z.object({
  termsVersion: z.number().int().positive(),
  evidenceRevision: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  decisionCode: z.number().int().min(1).max(3),
  evidenceCommitment: commitmentSchema,
  verdictCommitment: commitmentSchema,
  reportId: commitmentSchema,
}).strict();

export type DeliveryRequestInput = z.infer<typeof deliveryRequestInputSchema>;
export type EvidenceReceiptBindingInput = z.infer<typeof evidenceReceiptBindingInputSchema>;

/// This is the only request shape exposed to the CRE confidential workflow.
/// Criteria, credentials, repository names and raw provider responses stay out
/// of the deal row and out of the HTTP response.
export interface CreDeliveryRequest {
  dealId: `0x${string}`;
  termsVersion: number;
  evidenceRevision: number;
  expiresAt: number;
  pullNumber: number;
  submittedSha: string;
  publishedAt: number;
}

/// Stable identity for the durable request queue. The submitted SHA and pull
/// number are included so a retry with altered provider input cannot collide
/// with an earlier attempt for the same delivery revision.
export function creDeliveryRequestKey(request: CreDeliveryRequest): string {
  return [
    request.dealId.toLowerCase(),
    request.termsVersion,
    request.evidenceRevision,
    request.pullNumber,
    request.submittedSha.toLowerCase(),
  ].join(':');
}

export interface CreEvidenceReceiptBinding {
  termsVersion: number;
  evidenceRevision: number;
  expiresAt: number;
  decisionCode: number;
  evidenceCommitment: `0x${string}`;
  verdictCommitment: `0x${string}`;
  reportId: `0x${string}`;
  boundAt: number;
}

type DealForRequest = Pick<
  DirectDeal,
  | 'jobId'
  | 'delivered'
  | 'evidenceRequired'
  | 'agreementVersion'
  | 'deliveryRevision'
  | 'creDeliveryRequest'
  | 'creEvidenceReceipt'
  | 'evidenceExpectedCommitment'
>;

export type DeliveryRequestBuildResult =
  | { ok: true; request: CreDeliveryRequest; idempotent: boolean }
  | { ok: false; code: string; message: string };

export function buildCreDeliveryRequest(
  deal: DealForRequest,
  input: DeliveryRequestInput,
  nowSeconds = Math.floor(Date.now() / 1_000),
): DeliveryRequestBuildResult {
  const jobId = deal.jobId.toLowerCase();
  if (!bytes32Schema.safeParse(jobId).success) {
    return { ok: false, code: 'INVALID_DEAL_ID', message: 'deal id is not a bytes32 value' };
  }
  if (!deal.delivered) {
    return { ok: false, code: 'DELIVERY_REQUIRED', message: 'mark the current delivery before publishing evidence work' };
  }
  if (!deal.evidenceRequired) {
    return { ok: false, code: 'EVIDENCE_NOT_REQUIRED', message: 'evidence is not required by this agreement' };
  }
  const termsVersion = deal.agreementVersion ?? 1;
  const evidenceRevision = deal.deliveryRevision ?? 0;
  if (input.termsVersion !== termsVersion) {
    return { ok: false, code: 'STALE_AGREEMENT', message: 'the evidence request does not target the current agreement version' };
  }
  if (evidenceRevision <= 0 || input.evidenceRevision !== evidenceRevision) {
    return { ok: false, code: 'STALE_DELIVERY', message: 'the evidence request does not target the current delivery revision' };
  }
  if (input.expiresAt <= nowSeconds) {
    return { ok: false, code: 'REQUEST_EXPIRED', message: 'the evidence request must expire in the future' };
  }
  if (input.expiresAt > nowSeconds + 7 * 86_400) {
    return { ok: false, code: 'REQUEST_EXPIRY_TOO_FAR', message: 'the evidence request expiry must be within seven days' };
  }

  const request: CreDeliveryRequest = {
    dealId: jobId as `0x${string}`,
    termsVersion,
    evidenceRevision,
    expiresAt: input.expiresAt,
    pullNumber: input.pullNumber,
    submittedSha: input.submittedSha.toLowerCase(),
    publishedAt: deal.creDeliveryRequest?.publishedAt ?? Date.now(),
  };

  const existing = deal.creDeliveryRequest;
  if (existing) {
    const same = JSON.stringify(publicCreDeliveryRequest(existing)) === JSON.stringify(publicCreDeliveryRequest(request));
    if (!same) {
      return { ok: false, code: 'REQUEST_CONFLICT', message: 'a different evidence request is already published for this delivery revision' };
    }
    return { ok: true, request: existing, idempotent: true };
  }
  return { ok: true, request, idempotent: false };
}

export function publicCreDeliveryRequest(request: CreDeliveryRequest) {
  return {
    dealId: request.dealId,
    termsVersion: request.termsVersion,
    evidenceRevision: request.evidenceRevision,
    expiresAt: request.expiresAt,
    pullNumber: request.pullNumber,
    submittedSha: request.submittedSha,
  };
}

export function selectCurrentCreDeliveryRequest(
  deals: readonly DealForRequest[],
  requestedDealId?: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): { kind: 'ok'; request: CreDeliveryRequest } | { kind: 'none' } | { kind: 'ambiguous' } {
  const requested = requestedDealId?.toLowerCase();
  const active = deals
    .map((deal) => deal.creDeliveryRequest)
    .filter((request): request is CreDeliveryRequest => !!request)
    .filter((request) => request.expiresAt > nowSeconds)
    .filter((request) => !requested || request.dealId.toLowerCase() === requested)
    .filter((request) => {
      const deal = deals.find((candidate) => candidate.jobId.toLowerCase() === request.dealId.toLowerCase());
      return !!deal
        && deal.delivered
        && deal.evidenceRequired === true
        && (deal.agreementVersion ?? 1) === request.termsVersion
        && (deal.deliveryRevision ?? 0) === request.evidenceRevision;
    })
    .sort((left, right) => right.publishedAt - left.publishedAt);
  if (active.length === 0) return { kind: 'none' };
  if (active.length > 1 && !requested) return { kind: 'ambiguous' };
  const current = active[0];
  if (!current) return { kind: 'none' };
  return { kind: 'ok', request: current };
}

export type EvidenceReceiptBindingResult =
  | { ok: true; binding: CreEvidenceReceiptBinding; idempotent: boolean }
  | { ok: false; code: string; message: string };

export function bindCreEvidenceReceipt(
  deal: DealForRequest,
  input: EvidenceReceiptBindingInput,
  nowSeconds = Math.floor(Date.now() / 1_000),
): EvidenceReceiptBindingResult {
  const request = deal.creDeliveryRequest;
  if (!request) return { ok: false, code: 'REQUEST_NOT_PUBLISHED', message: 'publish the current delivery request first' };
  if (!deal.delivered || !deal.evidenceRequired) {
    return { ok: false, code: 'DELIVERY_NOT_ELIGIBLE', message: 'the current deal does not require a bindable evidence receipt' };
  }
  if (
    (deal.agreementVersion ?? 1) !== request.termsVersion
    || (deal.deliveryRevision ?? 0) !== request.evidenceRevision
  ) {
    return { ok: false, code: 'STALE_DELIVERY', message: 'the published request belongs to an older agreement or delivery revision' };
  }
  if (input.termsVersion !== request.termsVersion || input.evidenceRevision !== request.evidenceRevision) {
    return { ok: false, code: 'STALE_DELIVERY', message: 'the receipt does not target the current published request' };
  }
  if (input.expiresAt !== request.expiresAt) {
    return { ok: false, code: 'EXPIRY_MISMATCH', message: 'the receipt expiry does not match the published request' };
  }
  if (input.expiresAt <= nowSeconds) {
    return { ok: false, code: 'RECEIPT_EXPIRED', message: 'an expired receipt cannot be bound to the delivery' };
  }
  const binding: CreEvidenceReceiptBinding = {
    ...input,
    evidenceCommitment: input.evidenceCommitment as `0x${string}`,
    verdictCommitment: input.verdictCommitment as `0x${string}`,
    reportId: input.reportId as `0x${string}`,
    boundAt: Date.now(),
  };
  const existing = deal.creEvidenceReceipt;
  if (existing) {
    const same = existing.termsVersion === binding.termsVersion
      && existing.evidenceRevision === binding.evidenceRevision
      && existing.expiresAt === binding.expiresAt
      && existing.decisionCode === binding.decisionCode
      && existing.evidenceCommitment === binding.evidenceCommitment
      && existing.verdictCommitment === binding.verdictCommitment
      && existing.reportId === binding.reportId;
    if (!same) return { ok: false, code: 'RECEIPT_CONFLICT', message: 'a different receipt is already bound to this delivery revision' };
    return { ok: true, binding: existing, idempotent: true };
  }
  return { ok: true, binding, idempotent: false };
}

export function bearerTokenMatches(header: string | undefined, expected: string | undefined): boolean {
  if (!header || !expected || !header.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice('Bearer '.length));
  const configured = Buffer.from(expected);
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}
