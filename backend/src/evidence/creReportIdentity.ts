import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from 'viem';

export interface CreDeliveryReportIdentity {
  dealId: `0x${string}`;
  termsVersion: number;
  evidenceRevision: number;
  evidenceCommitment: `0x${string}`;
  verdictCommitment: `0x${string}`;
  decisionCode: number;
  leaseToken?: string;
}

/// A leased request adds its opaque lease token to the report-id preimage.
/// The registry still receives the same bytes32 field, while the queue can
/// reject a report produced by a worker whose lease was replaced.
export function creDeliveryReportId(identity: CreDeliveryReportIdentity): `0x${string}` {
  const values = [
    identity.dealId as Hex,
    BigInt(identity.termsVersion),
    BigInt(identity.evidenceRevision),
    identity.evidenceCommitment as Hex,
    identity.verdictCommitment as Hex,
    identity.decisionCode,
  ] as const;
  if (identity.leaseToken === undefined) {
    return keccak256(encodeAbiParameters(
      parseAbiParameters('bytes32 dealId, uint64 termsVersion, uint64 evidenceRevision, bytes32 evidenceCommitment, bytes32 verdictCommitment, uint8 decisionCode'),
      values,
    )) as `0x${string}`;
  }
  return keccak256(encodeAbiParameters(
    parseAbiParameters('bytes32 dealId, uint64 termsVersion, uint64 evidenceRevision, bytes32 evidenceCommitment, bytes32 verdictCommitment, uint8 decisionCode, string leaseToken'),
    [...values, identity.leaseToken],
  )) as `0x${string}`;
}
