import { keccak256, toHex } from 'viem';
import { config } from '../config.js';

/// What Karwan asserts, and the schema that says what an assertion looks like.
///
/// Paytag's verification model, in their words: they verify "who made the claim,
/// that it hasn't been tampered with, and that it can be traced back to its
/// source". Not that the claim is true. So an attestation here is an ATTRIBUTED
/// ASSERTION, and everything below exists to serve those three checks and nothing
/// else: a stable issuer identity, a signature over a canonical payload, and a
/// resolvable origin.
///
/// ## Why events and not aggregates
///
/// The obvious shape is a summary: deal count, settled volume, dispute rate. It is
/// the wrong shape, for three reasons.
///
/// An aggregate changes on every deal, so every deal would need a superseding or
/// revoked attestation. Paytag publishes a REVOCATIONS COUNT on the issuer profile,
/// so that turns ordinary business into churn against our own standing.
///
/// Aggregating is their product. Handing over a computed dispute rate makes Karwan
/// the assessor rather than the observer, which is the line we decided not to
/// cross.
///
/// And an aggregate cannot be traced to a source. "Twelve deals settled" is a
/// derivation; "this deal settled through this escrow" is an observation, and an
/// observation is the only thing their three checks can anchor to.
///
/// So: one credential type, one settled deal, issued once. Let their engine
/// aggregate.
///
/// ## Why only at finality
///
/// `settledAt` on a deal is irreversible. Delivery is not: a dispute can follow it.
/// Since revocations are public and counted, revoking is an incident rather than a
/// workflow, so nothing reversible gets attested. Settlement yes, delivery no.

/// Bumped only for a BREAKING change, and the new version lives at a new schema
/// URL while the old one keeps validating. Never repurpose a field, never version
/// inside the payload.
export const DEAL_SETTLED_TYPE = 'karwan.deal-settled.v1' as const;

/// The issuer's own domain. Identity is the domain plus the signing address, which
/// are the two things Paytag's issuer profile verifies.
function issuerDomain(): string {
  const base = config.FRONTEND_BASE_URL ?? 'https://karwan.site';
  return new URL(base).host;
}

function docBase(): string {
  // Served from the site host, not the API host: the issuer is identified by the
  // domain, so a manifest on a different host would be describing a different
  // issuer. A frontend rewrite proxies these paths to this backend so the
  // documents stay generated rather than hand-maintained.
  return (config.FRONTEND_BASE_URL ?? 'https://karwan.site').replace(/\/$/, '');
}

export function schemaUrl(): string {
  return `${docBase()}/schemas/deal-settled/v1.json`;
}

export function manifestUrl(): string {
  return `${docBase()}/.well-known/attestation-issuer.json`;
}

export function statusListUrl(): string {
  return `${docBase()}/attestations/revocations.json`;
}

/// Amount bands rather than figures.
///
/// The escrows are public, so an exact amount is derivable from chain by anyone who
/// looks. What chain data does NOT do is tie an amount to an identity, and that is
/// the join an attestation creates. Publishing a band keeps the evidence useful for
/// scoring without turning every settled deal into a public statement of what a
/// named business earned. The exact figure stays behind the x402 endpoints, where a
/// caller pays and is accountable for the request.
export const AMOUNT_BANDS = [
  'under-100',
  '100-1k',
  '1k-10k',
  '10k-100k',
  'over-100k',
] as const;

export type AmountBand = (typeof AMOUNT_BANDS)[number];

export function amountBand(usdc: number): AmountBand {
  if (!Number.isFinite(usdc) || usdc < 100) return 'under-100';
  if (usdc < 1_000) return '100-1k';
  if (usdc < 10_000) return '1k-10k';
  if (usdc < 100_000) return '10k-100k';
  return 'over-100k';
}

/// A commitment to the deal, not the deal id.
///
/// Publishing the raw job id would let anyone enumerate a business's deals against
/// the public job board. The hash still lets a holder PROVE which deal an
/// attestation refers to by revealing the id, which is the only thing a verifier
/// legitimately needs.
export function dealRef(jobId: string): `0x${string}` {
  return keccak256(toHex(`karwan.deal:${jobId}`));
}

export interface DealSettledClaim {
  /// keccak of the deal, never the deal id itself.
  dealRef: `0x${string}`;
  /// Which side of the deal the subject was on.
  role: 'buyer' | 'seller';
  settledAt: string;
  amountBand: AmountBand;
  currency: 'USDC';
  chainId: number;
  /// Whether the deal reached settlement through dispute resolution. Part of the
  /// observation, so a clean settlement and a contested one are distinguishable
  /// without us scoring either.
  viaDispute: boolean;
}

export interface DealSettledAttestation {
  type: typeof DEAL_SETTLED_TYPE;
  /// Points at the schema this document conforms to, so a consumer validates it
  /// without a prior conversation about field names. This is the whole reason the
  /// format is self-describing: agreement travels inside the artifact.
  schema: string;
  id: string;
  issuer: { name: 'Karwan'; domain: string; address: string };
  subject: { address: string };
  claim: DealSettledClaim;
  issuedAt: string;
  /// Absent on purpose. An event does not stop having happened, so there is nothing
  /// for an expiry to mean. Expiry belongs on aggregates, which is one more reason
  /// not to issue them.
  status: { listUrl: string };
  proof?: AttestationProof;
}

export interface AttestationProof {
  /// EIP-712 rather than a JOSE signature. Paytag said their side will have an
  /// "issuer contract" that checks an attestation meets its minimums, and a
  /// contract can ecrecover EIP-712 directly. A JWS would need an off-chain
  /// verifier they may not have.
  type: 'eip712';
  domain: { name: string; version: string; chainId: number };
  primaryType: 'DealSettled';
  signature: `0x${string}`;
}

/// The EIP-712 type definition, published so a verifier can rebuild the digest
/// without reading our source. Field ORDER is part of the hash, so this array is
/// the contract: appending to it is a breaking change and belongs in a v2 schema.
export const DEAL_SETTLED_EIP712_TYPES = {
  DealSettled: [
    { name: 'subject', type: 'address' },
    { name: 'dealRef', type: 'bytes32' },
    { name: 'role', type: 'string' },
    { name: 'settledAt', type: 'string' },
    { name: 'amountBand', type: 'string' },
    { name: 'currency', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'viaDispute', type: 'bool' },
  ],
} as const;

export function eip712Domain(chainId: number) {
  return { name: 'Karwan Attestation', version: '1', chainId } as const;
}

/// The JSON Schema the credential points at.
///
/// Generated from this module rather than kept as a separate file, so the published
/// schema and the code that emits documents cannot drift. A test asserts a real
/// attestation validates against it.
export function dealSettledSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: schemaUrl(),
    title: 'Karwan deal-settled attestation',
    description:
      'Karwan asserts that one deal it escrowed reached settlement. An attributed observation, not a judgement: it carries no score and no aggregate.',
    type: 'object',
    additionalProperties: false,
    required: ['type', 'schema', 'id', 'issuer', 'subject', 'claim', 'issuedAt', 'status'],
    properties: {
      type: { const: DEAL_SETTLED_TYPE },
      schema: { type: 'string', format: 'uri' },
      id: { type: 'string', minLength: 1, description: 'Stable per attestation, and the key a revocation names.' },
      issuer: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'domain', 'address'],
        properties: {
          name: { const: 'Karwan' },
          domain: { type: 'string' },
          address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
        },
      },
      subject: {
        type: 'object',
        additionalProperties: false,
        required: ['address'],
        properties: { address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' } },
      },
      claim: {
        type: 'object',
        additionalProperties: false,
        required: ['dealRef', 'role', 'settledAt', 'amountBand', 'currency', 'chainId', 'viaDispute'],
        properties: {
          dealRef: { type: 'string', pattern: '^0x[a-fA-F0-9]{64}$' },
          role: { enum: ['buyer', 'seller'] },
          settledAt: { type: 'string', format: 'date-time' },
          amountBand: { enum: [...AMOUNT_BANDS] },
          currency: { const: 'USDC' },
          chainId: { type: 'integer', minimum: 1 },
          viaDispute: { type: 'boolean' },
        },
      },
      issuedAt: { type: 'string', format: 'date-time' },
      status: {
        type: 'object',
        additionalProperties: false,
        required: ['listUrl'],
        properties: { listUrl: { type: 'string', format: 'uri' } },
      },
      proof: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'domain', 'primaryType', 'signature'],
        properties: {
          type: { const: 'eip712' },
          domain: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'version', 'chainId'],
            properties: {
              name: { const: 'Karwan Attestation' },
              version: { const: '1' },
              chainId: { type: 'integer', minimum: 1 },
            },
          },
          primaryType: { const: 'DealSettled' },
          signature: { type: 'string', pattern: '^0x[a-fA-F0-9]+$' },
        },
      },
    },
  } as const;
}

/// The issuer manifest. Everything a counterparty needs to decide whether to
/// consume us, in one document they can fetch rather than a conversation.
///
/// Modelled on the two agreements this codebase already honours: the OAuth
/// authorization-server metadata we serve at /.well-known, and the MCP server.json
/// that points at a published schema. Neither was negotiated; both are validated
/// mechanically. This is the same move aimed at Paytag.
export function issuerManifest(chainId: number) {
  return {
    schemaVersion: 1,
    issuer: {
      name: 'Karwan',
      type: 'cross-border settlement marketplace',
      domain: issuerDomain(),
      address: config.ATTESTATION_ISSUER_ADDRESS ?? null,
      description:
        'Karwan escrows cross-border trade in USDC and releases against delivery. It attests only to settlements it observed as the escrow.',
    },
    credentialTypes: [
      {
        type: DEAL_SETTLED_TYPE,
        schemaUrl: schemaUrl(),
        issuedWhen: 'A deal Karwan escrowed reaches settlement. Never before finality, and never for a state that can reverse.',
        proof: {
          type: 'eip712',
          domain: eip712Domain(chainId),
          primaryType: 'DealSettled',
          types: DEAL_SETTLED_EIP712_TYPES,
        },
      },
    ],
    statusListUrl: statusListUrl(),
    policy: {
      versioning:
        'Additive only. A breaking change ships as a new type and a new schema URL; the previous version keeps validating.',
      scope:
        'Observations only. Karwan does not issue scores, tiers or aggregates, so a consumer is never asked to trust our judgement, only our records.',
      amounts:
        'Banded rather than exact. The escrows are public, so figures are derivable from chain, but an attestation joins an amount to an identity and that join is not ours to publish.',
    },
  };
}
