import { createHash } from 'node:crypto';
import { parseUsdcMicro } from '../matching/money.js';

export type EvidenceSource = 'karwan-state' | 'onchain' | 'fresh-cache' | 'free-provider' | 'x402' | 'corroboration';
export type EvidenceClaim = 'completed-transactions' | 'completion-quality' | 'counterparty-concentration' | 'skill-attestation' | 'capacity' | 'market-benchmark';

export interface EvidenceNeed {
  needId: string;
  claim: EvidenceClaim;
  subject: string;
  decision: 'eligibility' | 'ranking' | 'qualification' | 'negotiation';
  requiredFreshnessSeconds: number;
  minimumReliability: number;
  maximumPriceUsdc: string;
  mandateVersion: number;
  policyVersion: string;
  expiresAtUnix: number;
}

export interface EvidenceSnapshot {
  snapshotId: string;
  needId: string;
  source: EvidenceSource;
  capturedAtUnix: number;
  reliability: number;
  status: 'fresh' | 'stale' | 'unknown' | 'contradictory';
  provenance: readonly string[];
  responseHash: string;
}

export interface EvidenceProvider {
  providerId: string;
  source: 'free-provider' | 'x402';
  endpoint: string;
  network: string;
  asset: string;
  payTo?: string;
  priceUsdc: string;
  expectedReliability: number;
  responseLimitBytes: number;
}

export interface EvidencePlannerInput {
  need: EvidenceNeed;
  nowUnix: number;
  directSnapshot?: EvidenceSnapshot;
  cachedSnapshots: readonly EvidenceSnapshot[];
  providers: readonly EvidenceProvider[];
  expectedDecisionValueUsdc: string;
  perDealSpentUsdc: string;
  perDealBudgetUsdc: string;
  allowedNetworks: readonly string[];
  allowedAssets: readonly string[];
  allowedPayTo: readonly string[];
}

export type EvidencePlan =
  | { action: 'use'; source: EvidenceSource; snapshot: EvidenceSnapshot; reason: string }
  | { action: 'purchase'; source: 'free-provider' | 'x402'; provider: EvidenceProvider; reason: string }
  | { action: 'wait'; reason: 'NO_DECISION_VALUE' | 'BUDGET_EXHAUSTED' | 'NO_APPROVED_PROVIDER' | 'NEED_EXPIRED' };

function isFresh(snapshot: EvidenceSnapshot, need: EvidenceNeed, nowUnix: number): boolean {
  return snapshot.status === 'fresh'
    && snapshot.capturedAtUnix + need.requiredFreshnessSeconds >= nowUnix
    && snapshot.reliability >= need.minimumReliability;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host === 'metadata.google.internal'
    || host === 'metadata'
  ) return true;
  if (
    host === '::1'
    || host === '[::1]'
    || host.startsWith('fc')
    || host.startsWith('fd')
    || /^fe[89ab]/.test(host)
    || host.startsWith('::ffff:127.')
    || host.startsWith('::ffff:10.')
    || host.startsWith('::ffff:192.168.')
  ) return true;
  const octets = host.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) return false;
  const values = octets.map(Number);
  if (values.some((value) => value > 255)) return true;
  const [first, second] = values;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second! >= 64 && second! <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second! >= 16 && second! <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19));
}

function validProvider(provider: EvidenceProvider, input: EvidencePlannerInput): boolean {
  try {
    const url = new URL(provider.endpoint);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password || isBlockedHostname(url.hostname)) return false;
    if (!input.allowedNetworks.includes(provider.network) || !input.allowedAssets.includes(provider.asset)) return false;
    if (provider.source === 'x402') {
      if (!provider.payTo || !/^0x[0-9a-f]{40}$/i.test(provider.payTo) || !input.allowedPayTo.map((value) => value.toLowerCase()).includes(provider.payTo.toLowerCase())) return false;
    }
    if (provider.responseLimitBytes <= 0 || provider.responseLimitBytes > 1_000_000) return false;
    const price = parseUsdcMicro(provider.priceUsdc);
    return price >= 0n && price <= parseUsdcMicro(input.need.maximumPriceUsdc);
  } catch {
    return false;
  }
}

export function planEvidenceAcquisition(input: EvidencePlannerInput): EvidencePlan {
  if (input.nowUnix >= input.need.expiresAtUnix) return { action: 'wait', reason: 'NEED_EXPIRED' };
  if (input.directSnapshot && isFresh(input.directSnapshot, input.need, input.nowUnix)) {
    return { action: 'use', source: input.directSnapshot.source, snapshot: input.directSnapshot, reason: 'AUTHORITATIVE_STATE_AVAILABLE' };
  }
  const cached = [...input.cachedSnapshots]
    .filter((snapshot) => snapshot.needId === input.need.needId && isFresh(snapshot, input.need, input.nowUnix))
    .sort((a, b) => b.capturedAtUnix - a.capturedAtUnix)[0];
  if (cached) return { action: 'use', source: 'fresh-cache', snapshot: cached, reason: 'FRESH_EVIDENCE_REUSED' };

  const value = parseUsdcMicro(input.expectedDecisionValueUsdc);
  const providers = input.providers.filter((provider) => validProvider(provider, input))
    .filter((provider) => provider.expectedReliability >= input.need.minimumReliability)
    .sort((a, b) => parseUsdcMicro(a.priceUsdc) < parseUsdcMicro(b.priceUsdc) ? -1 : 1);
  const free = providers.find((provider) => provider.source === 'free-provider');
  if (free) return { action: 'purchase', source: 'free-provider', provider: free, reason: 'APPROVED_FREE_PROVIDER' };
  const paid = providers.find((provider) => provider.source === 'x402');
  if (!paid) return { action: 'wait', reason: 'NO_APPROVED_PROVIDER' };
  const price = parseUsdcMicro(paid.priceUsdc);
  if (value <= price) return { action: 'wait', reason: 'NO_DECISION_VALUE' };
  if (parseUsdcMicro(input.perDealSpentUsdc) + price > parseUsdcMicro(input.perDealBudgetUsdc)) {
    return { action: 'wait', reason: 'BUDGET_EXHAUSTED' };
  }
  return { action: 'purchase', source: 'x402', provider: paid, reason: 'PAID_CLAIM_CAN_CHANGE_DECISION' };
}

export function evidenceNeedKey(need: EvidenceNeed): string {
  return createHash('sha256').update(`${need.claim}|${need.subject}|${need.mandateVersion}|${need.policyVersion}`).digest('hex');
}

export class InMemoryEvidencePurchaseLedger {
  private readonly snapshots = new Map<string, EvidenceSnapshot>();
  private readonly statuses = new Map<string, 'CREATED' | 'UNKNOWN' | 'RECONCILING' | 'SETTLED' | 'FAILED'>();

  getFresh(need: EvidenceNeed, nowUnix: number): EvidenceSnapshot | null {
    const snapshot = this.snapshots.get(evidenceNeedKey(need));
    return snapshot && isFresh(snapshot, need, nowUnix) ? snapshot : null;
  }

  recordStatus(need: EvidenceNeed, status: 'CREATED' | 'UNKNOWN' | 'RECONCILING' | 'SETTLED' | 'FAILED'): 'CREATED' | 'UNKNOWN' | 'RECONCILING' | 'SETTLED' | 'FAILED' {
    const key = evidenceNeedKey(need);
    const prior = this.statuses.get(key);
    if (prior === 'SETTLED' || prior === 'FAILED') return prior;
    this.statuses.set(key, status);
    return status;
  }

  recordSnapshot(need: EvidenceNeed, snapshot: EvidenceSnapshot): EvidenceSnapshot {
    const key = evidenceNeedKey(need);
    const prior = this.snapshots.get(key);
    if (prior && prior.responseHash !== snapshot.responseHash) throw new Error('EVIDENCE_NEED_ALREADY_HAS_DIFFERENT_SNAPSHOT');
    this.snapshots.set(key, prior ?? snapshot);
    return prior ?? snapshot;
  }
}
