import { createHash } from 'node:crypto';
import type { MarketRead } from '../x402/externalClient.js';
import type { EvidenceAcquisitionShadowTaskData } from './evidenceAcquisitionShadow.js';

const MARKET_RESEARCH_FRESHNESS_SECONDS = 6 * 60 * 60;

function stableSubject(keywords: readonly string[]): string {
  return [...new Set(keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join('|');
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Projects the existing market-research result into the acquisition shadow
 * task format. The legacy research call has already happened before this
 * function runs; this projection never selects a provider or pays again.
 *
 * The legacy response may contain one tx hash for a multi-angle sweep, so it
 * is intentionally recorded as UNKNOWN rather than falsely treated as a
 * settled per-request payment. That uncertainty must remain visible to the
 * evidence planner and matching projection.
 */
export function buildMarketEvidenceAcquisitionObservation(
  read: MarketRead,
  jobId: string,
  source: 'negotiation-shadow' | 'research-scout-shadow' = 'negotiation-shadow',
): EvidenceAcquisitionShadowTaskData {
  const subject = stableSubject(read.keywords);
  if (!subject) throw new Error('market evidence requires at least one keyword');
  if (!jobId.trim()) throw new Error('market evidence requires a job id');

  const observedAtUnix = Math.floor(read.researchedAt / 1000);
  // A cached read keeps the same researchedAt and therefore the same durable
  // need. A genuinely fresh read gets a new evidence version so the runtime
  // does not collide with the prior immutable snapshot.
  const evidenceVersion = `legacy-market-research-v1:${observedAtUnix}`;
  const evidenceKey = digest({ jobId, subject, claim: 'market-benchmark', evidenceVersion });
  const responseHash = `sha256:${digest({
    keywords: read.keywords,
    summary: read.summary,
    demand: read.demand,
    priceNote: read.priceNote,
    fairPriceUsdc: read.fairPriceUsdc ?? null,
    priceConfidence: read.priceConfidence ?? 'none',
    priceBandUsdc: read.priceBandUsdc ?? null,
    priceObservations: read.priceObservations ?? [],
    highlights: read.highlights,
    sources: read.sources,
    anglesRun: read.anglesRun ?? [],
    researchedAt: read.researchedAt,
  })}`;
  const provenance = [
    'provider:exa-market-research',
    ...(read.txHash ? [`payment:${read.txHash}`] : []),
    ...read.sources.slice(0, 24).map((source) => `source:${source.url}`),
  ].slice(0, 32);

  return {
    dealRoomId: jobId,
    source,
    idempotencyKey: `legacy-market-evidence:${evidenceKey}`,
    planner: {
      nowUnix: observedAtUnix,
      need: {
        needId: `legacy-market-evidence-need:${evidenceKey}`,
        claim: 'market-benchmark',
        subject,
        decision: 'negotiation',
        requiredFreshnessSeconds: MARKET_RESEARCH_FRESHNESS_SECONDS,
        minimumReliability: 60,
        maximumPriceUsdc: Math.max(0, read.paidUsd).toFixed(6),
        mandateVersion: 1,
        policyVersion: evidenceVersion,
        expiresAtUnix: observedAtUnix + MARKET_RESEARCH_FRESHNESS_SECONDS,
      },
      directSnapshot: {
        snapshotId: `legacy-market-evidence-snapshot:${evidenceKey}`,
        needId: `legacy-market-evidence-need:${evidenceKey}`,
        source: 'x402',
        capturedAtUnix: observedAtUnix,
        reliability: 0,
        status: 'unknown',
        provenance,
        responseHash,
      },
      cachedSnapshots: [],
      providers: [],
      expectedDecisionValueUsdc: (read.fairPriceUsdc ?? 0).toFixed(6),
      perDealSpentUsdc: Math.max(0, read.paidUsd).toFixed(6),
      perDealBudgetUsdc: Math.max(0, read.paidUsd).toFixed(6),
      allowedNetworks: ['base'],
      allowedAssets: ['USDC'],
      allowedPayTo: [],
      requiredProvenance: [],
    },
  };
}

/**
 * Projects a user-triggered market scout into the same evidence shadow lane
 * without exposing the wallet address or making it part of the room key.
 * The legacy scout provider call and prepaid-credit charge remain the only
 * authoritative operations; this is an audit/planning observation only.
 */
export function buildResearchScoutEvidenceAcquisitionObservation(
  read: MarketRead,
  owner: string,
): EvidenceAcquisitionShadowTaskData {
  const normalizedOwner = owner.trim().toLowerCase();
  if (!normalizedOwner) throw new Error('research scout evidence requires an owner');
  const subject = stableSubject(read.keywords);
  if (!subject) throw new Error('research scout evidence requires at least one keyword');
  const scoutRoomId = `research-scout:${digest({ owner: normalizedOwner, subject, researchedAt: read.researchedAt })}`;
  return buildMarketEvidenceAcquisitionObservation(read, scoutRoomId, 'research-scout-shadow');
}
