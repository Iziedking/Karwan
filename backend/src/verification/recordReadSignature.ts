import { keccak256, toHex, verifyTypedData } from 'viem';
import { signAsIssuer } from '../attestation/issuer.js';
import type { RecordReadBody } from '../reputation/recordRead.js';

/// A record read signed with Karwan's issuer key, the one published at
/// /.well-known/attestation-issuer.json. Partner platforms sign theirs the same
/// way with their own key.

export interface SignedRecordRead extends RecordReadBody {
  chainId: number;
  signature: `0x${string}`;
}

const DOMAIN = { name: 'Karwan Record Read', version: '1' } as const;

const TYPES = {
  KarwanRecordRead: [
    { name: 'subject', type: 'address' },
    { name: 'bodyHash', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
} as const;

/// The body is covered by a hash of a fixed field order, so any reader can
/// recompute it from the document it received.
export function recordReadHash(b: RecordReadBody): `0x${string}` {
  const c = b.counts;
  const outcomes = b.outcomes.map((o) => [o.endedAt, o.success, o.onTime, o.valueBand, o.role, o.counterparty].join('|'));
  const canonical = [
    b.version,
    b.issuer,
    b.subject.address,
    b.subject.tag ?? '',
    b.level,
    b.score,
    b.tier,
    c.completed,
    c.onTimeRate ?? '',
    c.disputesWon,
    c.disputesLost,
    c.cancelled,
    ...outcomes,
  ].join('\n');
  return keccak256(toHex(canonical));
}

const message = (b: RecordReadBody) => ({
  subject: b.subject.address as `0x${string}`,
  bodyHash: recordReadHash(b),
  issuedAt: BigInt(b.issuedAt),
  expiresAt: BigInt(b.expiresAt),
});

/// Null when the issuer key is not configured.
export async function signRecordRead(body: RecordReadBody, chainId: number): Promise<SignedRecordRead | null> {
  const signature = await signAsIssuer({
    domain: { ...DOMAIN, chainId },
    types: TYPES,
    primaryType: 'KarwanRecordRead',
    message: message(body),
  });
  return signature ? { ...body, chainId, signature } : null;
}

export async function verifyRecordRead(doc: SignedRecordRead, issuer: string, now: number): Promise<boolean> {
  if (doc.expiresAt <= now) return false;
  const { chainId, signature, ...body } = doc;
  try {
    return await verifyTypedData({
      address: issuer as `0x${string}`,
      domain: { ...DOMAIN, chainId },
      types: TYPES,
      primaryType: 'KarwanRecordRead',
      message: message(body),
      signature,
    });
  } catch {
    return false;
  }
}
