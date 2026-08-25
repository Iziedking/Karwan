import type { SellerProfile } from '../agents/seller-profile.js';
import type { Listing } from '../db/listings.js';
import { parseUsdcMicro } from './money.js';
import type {
  MatchingCandidateSnapshot,
  MatchingLane,
  MatchingMandateSnapshot,
} from './types.js';
import {
  projectProfileSkillEvidence,
  stableProjectionVersion,
  type ProfileSkillEvidenceInput,
} from './profileProjection.js';
import type { MatchingSkillEvidence } from './types.js';
import type { MatchingShadowObservation } from './shadow.js';
import type { MatchingAuditTelemetry } from './audit.js';
import {
  MATCHING_RELIABILITY_POLICY_VERSION,
  minimumReliabilityForLane,
} from './reliabilityPolicy.js';

export interface ListingMatchingJobInput {
  jobId: string;
  buyer: string;
  /** The identity that owns the buyer agent. Falls back to buyer for legacy jobs. */
  ownerAddress?: string;
  budgetUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  briefText?: string;
  keywords?: string[];
  negotiationMaxIncreasePct?: number;
  tradeLane?: MatchingLane;
  partyKind?: 'person' | 'business';
}

function formatUsdcMicros(micros: bigint): string {
  const whole = micros / 1_000_000n;
  const fraction = (micros % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function evidenceFingerprint(evidence: readonly MatchingSkillEvidence[] | undefined): string {
  return JSON.stringify([...(evidence ?? [])]
    .map((item) => ({
      skillId: item.skillId.toLowerCase(),
      status: item.status,
      issuer: item.issuer?.toLowerCase() ?? null,
      expiresAtUnix: item.expiresAtUnix ?? null,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}

function normalizedTerms(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

function effectiveBudget(job: ListingMatchingJobInput): string {
  const increaseBps = Math.round(Math.max(0, job.negotiationMaxIncreasePct ?? 0) * 100);
  const base = parseUsdcMicro(job.budgetUsdc);
  return formatUsdcMicros((base * BigInt(10_000 + increaseBps)) / 10_000n);
}

export function listingMandateVersion(job: ListingMatchingJobInput): number {
  return stableProjectionVersion({
    kind: 'listing-mandate',
    jobId: job.jobId.trim().toLowerCase(),
    buyer: job.buyer.trim().toLowerCase(),
    ownerAddress: (job.ownerAddress ?? job.buyer).trim().toLowerCase(),
    termsHash: job.termsHash,
    budgetUsdc: job.budgetUsdc,
    deadlineUnix: job.deadlineUnix,
    briefText: job.briefText?.trim() || null,
    keywords: normalizedTerms(job.keywords),
    negotiationMaxIncreasePct: job.negotiationMaxIncreasePct ?? null,
    tradeLane: job.tradeLane ?? 'service',
    partyKind: job.partyKind ?? 'person',
  });
}

export function listingCandidateVersion(
  listing: Listing,
  seller: Pick<SellerProfile, 'address' | 'userAddress' | 'skills' | 'keywords'> & {
    skillVerifications?: readonly ProfileSkillEvidenceInput[];
  },
): number {
  const skillEvidence = projectProfileSkillEvidence(seller.skillVerifications);
  return stableProjectionVersion({
    kind: 'listing-candidate',
    listingId: listing.id,
    title: listing.title,
    description: listing.description,
    askingPriceUsdc: listing.askingPriceUsdc,
    negotiationMaxDecreasePct: listing.negotiationMaxDecreasePct ?? null,
    postedAt: listing.postedAt,
    expiresAt: listing.expiresAt,
    tradeLane: listing.tradeLane ?? 'service',
    partyKind: listing.partyKind ?? 'person',
    sellerAddress: seller.address.trim().toLowerCase(),
    sellerOwnerAddress: seller.userAddress.trim().toLowerCase(),
    declaredSkills: normalizedTerms(seller.skills),
    keywords: normalizedTerms(seller.keywords),
    skillEvidence: evidenceFingerprint(skillEvidence),
  });
}

export function buildListingMatchingMandate(
  job: ListingMatchingJobInput,
): MatchingMandateSnapshot {
  const lane = job.tradeLane ?? 'service';
  return {
    mandateId: job.jobId,
    version: listingMandateVersion(job),
    ownerAddress: (job.ownerAddress ?? job.buyer).toLowerCase(),
    agentAddress: job.buyer.toLowerCase(),
    lane,
    budgetUsdc: job.budgetUsdc,
    maxBudgetUsdc: effectiveBudget(job),
    maxDeadlineUnix: job.deadlineUnix,
    requiredKeywords: [...(job.keywords ?? [])],
    minimumReliability: minimumReliabilityForLane(lane),
    reliabilityPolicyVersion: MATCHING_RELIABILITY_POLICY_VERSION,
    ...(lane === 'finance' ? { requiresVerifiedBusiness: true } : {}),
  };
}

export function buildListingMatchingCandidate(
  listing: Listing,
  seller: Pick<SellerProfile, 'address' | 'userAddress' | 'skills' | 'keywords'> & {
    skillVerifications?: readonly ProfileSkillEvidenceInput[];
  },
  deadlineUnix: number,
): MatchingCandidateSnapshot {
  const skillEvidence = projectProfileSkillEvidence(seller.skillVerifications);
  return {
    candidateId: listing.id,
    version: listingCandidateVersion(listing, seller),
    kind: 'listing',
    sellerAgentAddress: seller.address.toLowerCase(),
    sellerOwnerAddress: seller.userAddress.toLowerCase(),
    lane: listing.tradeLane ?? 'service',
    partyKind: listing.partyKind ?? 'person',
    title: listing.title,
    description: listing.description,
    keywords: [...seller.keywords],
    declaredSkills: [...seller.skills],
    ...(skillEvidence.length > 0 ? { skillEvidence } : {}),
    priceUsdc: String(listing.askingPriceUsdc),
    deadlineUnix,
    expiresAtUnix: Math.floor(listing.expiresAt / 1_000),
    capacityAvailable: true,
  };
}

export function buildListingMatchingProjection(
  listing: Listing,
  seller: Pick<SellerProfile, 'address' | 'userAddress' | 'skills' | 'keywords'> & {
    skillVerifications?: readonly ProfileSkillEvidenceInput[];
  },
  job: ListingMatchingJobInput,
): { mandate: MatchingMandateSnapshot; candidate: MatchingCandidateSnapshot } {
  return {
    mandate: buildListingMatchingMandate(job),
    candidate: buildListingMatchingCandidate(listing, seller, job.deadlineUnix),
  };
}

export function buildListingMatchingShadowObservation(
  listing: Listing,
  seller: Pick<SellerProfile, 'address' | 'userAddress' | 'skills' | 'keywords'> & {
    skillVerifications?: readonly ProfileSkillEvidenceInput[];
  },
  job: ListingMatchingJobInput,
  legacyMatched: boolean,
  observedAt: number,
  telemetry?: MatchingAuditTelemetry,
): MatchingShadowObservation {
  const projection = buildListingMatchingProjection(listing, seller, job);
  return {
    source: 'listing-brief',
    observationKey: [
      'listing-brief',
      job.jobId,
      listing.id,
      `mandate:${projection.mandate.version}`,
      `candidate:${projection.candidate.version}`,
      `legacy:${legacyMatched ? 'matched' : 'skipped'}`,
    ].join(':'),
    mandate: projection.mandate,
    candidates: [projection.candidate],
    legacyCandidateIds: legacyMatched ? [listing.id] : [],
    nowUnix: observedAt,
    ...(telemetry ? { telemetry } : {}),
  };
}
