import { createHash } from 'node:crypto';
import { z } from 'zod';
import { payExternal } from '../x402/externalClient.js';
import { parseUsdcMicro } from '../matching/money.js';
import type { EvidenceAcquisitionAdapter } from './acquisitionTask.js';
import type { EvidenceNeed } from './planner.js';

const responseSchema = z.object({
  snapshot: z.object({
    snapshotId: z.string().min(1),
    needId: z.string().min(1),
    capturedAtUnix: z.number().int().nonnegative().optional(),
    reliability: z.number().int().min(0).max(100),
    status: z.enum(['fresh', 'stale', 'unknown', 'contradictory']),
    provenance: z.array(z.string().min(1)).max(32),
  }).strict(),
  providerTransactionId: z.string().min(1).optional(),
}).strict();

export interface X402EvidenceTransportResult<T> {
  data: T;
  paidUsd: number;
  payer: string;
  txHash?: string;
}

export type X402EvidenceTransport = (
  url: string,
  options: {
    method: 'POST';
    body: Readonly<Record<string, unknown>>;
  },
) => Promise<X402EvidenceTransportResult<unknown>>;

export interface X402EvidenceAdapterOptions {
  transport?: X402EvidenceTransport;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(',')}}`;
}

function responseHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function paidMicros(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) throw new Error('EVIDENCE_PAYMENT_AMOUNT_INVALID');
  const scaled = value * 1_000_000;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-7) {
    throw new Error('EVIDENCE_PAYMENT_AMOUNT_INVALID');
  }
  return BigInt(rounded);
}

function assertEndpoint(endpoint: string): void {
  const url = new URL(endpoint);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const blocked = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname === 'metadata.google.internal'
    || hostname === 'metadata'
    || hostname === '::1'
    || hostname.startsWith('127.')
    || hostname.startsWith('10.')
    || hostname.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    || hostname.startsWith('169.254.');
  if (url.protocol !== 'https:' || url.username || url.password || blocked) {
    throw new Error('EVIDENCE_PROVIDER_ENDPOINT_INVALID');
  }
}

function defaultTransport(
  url: string,
  options: { method: 'POST'; body: Readonly<Record<string, unknown>> },
): Promise<X402EvidenceTransportResult<unknown>> {
  return payExternal(url, options);
}

/**
 * Adapts the existing x402 payer to the reviewed evidence operation seam.
 * The transport is injectable so this module can be characterized without a
 * network call. A response is accepted only when it matches the strict
 * provider contract, the paid amount equals the registered price, and the
 * snapshot is bound to the requested evidence need. Missing settlement proof
 * deliberately becomes UNKNOWN, leaving the durable credit reservation held
 * for reconciliation rather than charging or retrying blindly.
 */
export function createX402EvidenceAcquisitionAdapter(
  options: X402EvidenceAdapterOptions = {},
): EvidenceAcquisitionAdapter {
  const transport = options.transport ?? defaultTransport;
  return {
    async acquire(input) {
      if (input.provider.source !== 'x402') throw new Error('EVIDENCE_PROVIDER_SOURCE_INVALID');
      assertEndpoint(input.provider.endpoint);
      const result = await transport(input.provider.endpoint, {
        method: 'POST',
        body: {
          providerId: input.provider.providerId,
          providerVersion: input.provider.providerVersion,
          idempotencyKey: input.idempotencyKey,
          needId: input.need.needId,
          claim: input.need.claim,
          subject: input.need.subject,
          decision: input.need.decision,
        },
      });
      if (paidMicros(result.paidUsd) !== parseUsdcMicro(input.provider.priceUsdc)) {
        throw new Error('EVIDENCE_PAYMENT_AMOUNT_MISMATCH');
      }
      const parsed = responseSchema.parse(result.data);
      if (parsed.snapshot.needId !== input.need.needId) {
        throw new Error('EVIDENCE_SNAPSHOT_NEED_MISMATCH');
      }
      const capturedAtUnix = parsed.snapshot.capturedAtUnix ?? input.nowUnix;
      if (capturedAtUnix > input.nowUnix + 300) throw new Error('EVIDENCE_SNAPSHOT_FROM_FUTURE');
      if (parsed.snapshot.provenance.length === 0) throw new Error('EVIDENCE_PROVENANCE_MISSING');
      const missingProvenance = input.provider.provenanceRequirements.filter((requirement) =>
        !parsed.snapshot.provenance.some((value) => value === requirement || value.startsWith(`${requirement}:`)));
      if (missingProvenance.length > 0) throw new Error('EVIDENCE_PROVENANCE_INCOMPLETE');
      if (Buffer.byteLength(canonicalJson(parsed), 'utf8') > input.provider.responseLimitBytes) {
        throw new Error('EVIDENCE_RESPONSE_TOO_LARGE');
      }
      const reliability = Math.min(parsed.snapshot.reliability, input.provider.expectedReliability);
      const snapshot = {
        snapshotId: parsed.snapshot.snapshotId,
        needId: parsed.snapshot.needId,
        source: 'x402' as const,
        capturedAtUnix,
        reliability,
        status: parsed.snapshot.status,
        provenance: parsed.snapshot.provenance,
        responseHash: responseHash(parsed),
      };
      return {
        state: result.txHash ? 'settled' : 'unknown',
        ...(parsed.providerTransactionId ? { providerTransactionId: parsed.providerTransactionId } : {}),
        ...(result.txHash ? { txHash: result.txHash } : {}),
        snapshot,
      };
    },
  };
}

export function x402EvidenceResponseHash(value: unknown): string {
  return responseHash(value);
}

export type X402EvidenceNeedInput = EvidenceNeed;
