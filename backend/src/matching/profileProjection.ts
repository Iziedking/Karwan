import { createHash } from 'node:crypto';
import type { MatchingSkillEvidence, MatchingTransactionEvidence } from './types.js';
import {
  MATCHING_RELIABILITY_POLICY_VERSION,
  minimumReliabilityForLane,
} from './reliabilityPolicy.js';

export type ProfileProjectionLane = 'service' | 'finance';
export type ProfileProjectionTier = 'new' | 'cold' | 'established' | 'strong' | 'elite';
export type ProfileSkillStatus = 'pending' | 'verified' | 'rejected' | 'expired' | 'revoked';

export interface ProfileSkillEvidenceInput {
  skillId: string;
  status: ProfileSkillStatus;
  issuer: string;
  expiresAt?: number;
}

export interface ProfileMandateVersionInput {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  negotiationMaxIncreasePct?: number;
  keywords?: readonly string[];
  briefText?: string;
  trustedMatch?: boolean;
  tradeLane?: ProfileProjectionLane;
  sourcingSector?: string;
  sourcingRegion?: string;
  minimumReliability?: number;
}

export interface ProfileCandidateVersionInput {
  candidateId: string;
  sellerAgentAddress: string;
  sellerOwnerAddress?: string;
  priceUsdc: string;
  deadlineUnix: number;
  lane: ProfileProjectionLane;
  keywords?: readonly string[];
  declaredSkills?: readonly string[];
  skillEvidence?: readonly MatchingSkillEvidence[];
  tier?: ProfileProjectionTier;
  transactionEvidence?: readonly MatchingTransactionEvidence[];
}

export interface ProfileSellerMandateVersionInput {
  dealRoomId: string;
  sellerAgentAddress: string;
  sellerOwnerAddress?: string;
  minimumPriceUsdc: string;
  maxDeadlineUnix: number;
  lane: ProfileProjectionLane;
  keywords?: readonly string[];
  declaredSkills?: readonly string[];
  skillEvidence?: readonly MatchingSkillEvidence[];
  tier?: ProfileProjectionTier;
}

function normalizedList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

function epochSeconds(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value > 10_000_000_000 ? Math.floor(value / 1_000) : Math.floor(value);
}

/**
 * Preserve declared and attested skill states without upgrading pending or
 * rejected records into verified evidence. Profile timestamps may be stored
 * in milliseconds, while matching snapshots use Unix seconds.
 */
export function projectProfileSkillEvidence(
  records: readonly ProfileSkillEvidenceInput[] | undefined,
): MatchingSkillEvidence[] {
  return (records ?? []).map((record) => ({
    skillId: record.skillId,
    status: record.status === 'pending' ? 'declared' : record.status,
    issuer: record.issuer,
    ...(epochSeconds(record.expiresAt) === undefined ? {} : { expiresAtUnix: epochSeconds(record.expiresAt) }),
  }));
}

export function stableProjectionVersion(value: unknown): number {
  const digest = createHash('sha256').update(JSON.stringify(value)).digest();
  return Math.max(1, digest.readUInt32BE(0));
}

export function profileMandateVersion(input: ProfileMandateVersionInput): number {
  return stableProjectionVersion({
    kind: 'profile-mandate',
    jobId: input.jobId.trim().toLowerCase(),
    buyer: input.buyer.trim().toLowerCase(),
    budgetUsdc: input.budgetUsdc,
    deadlineUnix: input.deadlineUnix,
    termsHash: input.termsHash,
    negotiationMaxIncreasePct: input.negotiationMaxIncreasePct ?? null,
    keywords: normalizedList(input.keywords),
    briefText: input.briefText?.trim() || null,
    trustedMatch: input.trustedMatch === true,
    tradeLane: input.tradeLane ?? 'service',
    sourcingSector: input.sourcingSector?.trim().toLowerCase() || null,
    sourcingRegion: input.sourcingRegion?.trim().toLowerCase() || null,
    minimumReliability: input.minimumReliability ?? minimumReliabilityForLane(input.tradeLane ?? 'service'),
    reliabilityPolicyVersion: MATCHING_RELIABILITY_POLICY_VERSION,
  });
}

export function profileCandidateVersion(input: ProfileCandidateVersionInput): number {
  return stableProjectionVersion({
    kind: 'profile-candidate',
    candidateId: input.candidateId.trim().toLowerCase(),
    sellerAgentAddress: input.sellerAgentAddress.trim().toLowerCase(),
    sellerOwnerAddress: input.sellerOwnerAddress?.trim().toLowerCase() || null,
    priceUsdc: input.priceUsdc,
    deadlineUnix: input.deadlineUnix,
    lane: input.lane,
    keywords: normalizedList(input.keywords),
    declaredSkills: normalizedList(input.declaredSkills),
    skillEvidence: [...(input.skillEvidence ?? [])]
      .map((item) => ({
        skillId: item.skillId.trim().toLowerCase(),
        status: item.status,
        issuer: item.issuer?.trim().toLowerCase() ?? null,
        evidenceId: item.evidenceId?.trim() || null,
        expiresAtUnix: item.expiresAtUnix ?? null,
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    tier: input.tier ?? null,
    transactionEvidence: [...(input.transactionEvidence ?? [])]
      .map((item) => ({
        source: item.source,
        completed: item.completed,
        disputed: item.disputed,
        failed: item.failed,
        paymentStatus: item.paymentStatus ?? null,
        verified: item.verified,
        evidenceId: item.evidenceId ?? null,
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  });
}

export function profileSellerMandateVersion(input: ProfileSellerMandateVersionInput): number {
  return stableProjectionVersion({
    kind: 'profile-seller-mandate',
    dealRoomId: input.dealRoomId.trim().toLowerCase(),
    sellerAgentAddress: input.sellerAgentAddress.trim().toLowerCase(),
    sellerOwnerAddress: input.sellerOwnerAddress?.trim().toLowerCase() || null,
    minimumPriceUsdc: input.minimumPriceUsdc,
    maxDeadlineUnix: input.maxDeadlineUnix,
    lane: input.lane,
    keywords: normalizedList(input.keywords),
    declaredSkills: normalizedList(input.declaredSkills),
    skillEvidence: [...(input.skillEvidence ?? [])]
      .map((item) => ({
        skillId: item.skillId.trim().toLowerCase(),
        status: item.status,
        issuer: item.issuer?.trim().toLowerCase() ?? null,
        evidenceId: item.evidenceId?.trim() || null,
        expiresAtUnix: item.expiresAtUnix ?? null,
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    tier: input.tier ?? null,
  });
}
