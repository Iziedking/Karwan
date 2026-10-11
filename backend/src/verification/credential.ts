import { keccak256, toHex, verifyTypedData } from 'viem';
import { issuerAddress, signAsIssuer } from '../attestation/issuer.js';
import { config } from '../config.js';
import type { Ladder } from './ladder.js';

export const RECORD_TYPE = 'karwan.record.v2' as const;
const DAY_MS = 24 * 3_600_000;

export interface CredentialFact {
  kind: string;
  level: string;
  issuedAt: number;
  expiresAt: number;
  /// The transaction that wrote it to KarwanFacts, once it is on chain.
  txHash?: string;
}

export interface RecordCredential {
  type: typeof RECORD_TYPE;
  issuer: { name: 'Karwan'; domain: string; address: string };
  subject: { address: string };
  claim: {
    level: Ladder;
    tier: string;
    reasons: string[];
    facts: CredentialFact[];
    chainId: number;
    factsContract: string;
  };
  issuedAt: string;
  expiresAt: string;
  proof: { type: 'eip712'; domain: typeof DOMAIN_BASE & { chainId: number }; primaryType: 'KarwanRecord'; signature: `0x${string}` };
}

const DOMAIN_BASE = { name: 'Karwan Record', version: '2' } as const;

const TYPES = {
  KarwanRecord: [
    { name: 'subject', type: 'address' },
    { name: 'level', type: 'string' },
    { name: 'tier', type: 'string' },
    { name: 'reasons', type: 'string' },
    { name: 'factsHash', type: 'bytes32' },
    { name: 'chainId', type: 'uint256' },
    { name: 'factsContract', type: 'address' },
    { name: 'issuedAt', type: 'string' },
    { name: 'expiresAt', type: 'string' },
  ],
} as const;

/// The fact list is covered by its hash, computed from a fixed field order, so
/// anyone can recompute it from the document.
function factsHash(facts: CredentialFact[]): `0x${string}` {
  const canonical = facts.map((f) => [f.kind, f.level, f.issuedAt, f.expiresAt, f.txHash ?? ''].join('|'));
  return keccak256(toHex(canonical.join('\n')));
}

function message(doc: Omit<RecordCredential, 'proof'>) {
  return {
    subject: doc.subject.address as `0x${string}`,
    level: doc.claim.level,
    tier: doc.claim.tier,
    reasons: doc.claim.reasons.join(','),
    factsHash: factsHash(doc.claim.facts),
    chainId: BigInt(doc.claim.chainId),
    factsContract: doc.claim.factsContract as `0x${string}`,
    issuedAt: doc.issuedAt,
    expiresAt: doc.expiresAt,
  };
}

/// A signed copy of a person's record they can hand to any platform. It names
/// only facts valid at issue, and lasts a day so a copy cannot outlive a
/// revoked fact for long. Null when the issuer key is not configured.
export async function buildRecordCredential(input: {
  subject: string;
  level: Ladder;
  tier: string;
  reasons: string[];
  facts: CredentialFact[];
  chainId: number;
  factsContract: string;
  now: number;
}): Promise<RecordCredential | null> {
  const address = issuerAddress();
  if (!address) return null;
  const unsigned: Omit<RecordCredential, 'proof'> = {
    type: RECORD_TYPE,
    issuer: { name: 'Karwan', domain: new URL(config.FRONTEND_BASE_URL ?? 'https://karwan.site').host, address },
    subject: { address: input.subject.toLowerCase() },
    claim: {
      level: input.level,
      tier: input.tier,
      reasons: input.reasons,
      facts: input.facts
        .filter((f) => f.expiresAt > input.now)
        .map((f) => ({ kind: f.kind, level: f.level, issuedAt: f.issuedAt, expiresAt: f.expiresAt, ...(f.txHash ? { txHash: f.txHash } : {}) })),
      chainId: input.chainId,
      factsContract: input.factsContract.toLowerCase(),
    },
    issuedAt: new Date(input.now).toISOString(),
    expiresAt: new Date(input.now + DAY_MS).toISOString(),
  };
  const domain = { ...DOMAIN_BASE, chainId: input.chainId };
  const signature = await signAsIssuer({ domain, types: TYPES, primaryType: 'KarwanRecord', message: message(unsigned) });
  if (!signature) return null;
  return { ...unsigned, proof: { type: 'eip712', domain, primaryType: 'KarwanRecord', signature } };
}

export async function verifyRecordCredential(doc: RecordCredential, issuer: string): Promise<boolean> {
  try {
    const { proof, ...unsigned } = doc;
    return await verifyTypedData({
      address: issuer as `0x${string}`,
      domain: { ...DOMAIN_BASE, chainId: unsigned.claim.chainId },
      types: TYPES,
      primaryType: 'KarwanRecord',
      message: message(unsigned),
      signature: proof.signature,
    });
  } catch {
    return false;
  }
}
