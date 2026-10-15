import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  parseAbiParameters,
  toFunctionSelector,
  type Address,
  type Hex,
} from 'viem';

/// Encoders for the frozen layouts in contracts/src/suite/interfaces/IKarwanCreAdapter.sol.
export const CHECK = 1;
export const FACT = 2;
export const KEEP = 3;

/// The report id is derived from what is reported and when, so every DON
/// node computes the same one and a re-sent identical report is refused.
export function encodeEnvelope(input: { kind: number; chainId: number; adapter: Address; issuedAt: number; body: Hex }): {
  report: Hex;
  reportId: Hex;
} {
  const reportId = keccak256(encodeAbiParameters(parseAbiParameters('uint8, bytes, uint64'), [
    input.kind,
    input.body,
    BigInt(input.issuedAt),
  ]));
  const report = encodeAbiParameters(parseAbiParameters('uint8, uint256, address, uint64, bytes32, bytes'), [
    input.kind,
    BigInt(input.chainId),
    input.adapter,
    BigInt(input.issuedAt),
    reportId,
    input.body,
  ]);
  return { report, reportId };
}

export interface CheckResult {
  verifier: Address;
  family: Address;
  dealId: Hex;
  revision: number;
  pass: boolean;
  evidenceHash: Hex;
}

export function checkBody(c: CheckResult): Hex {
  return encodeAbiParameters(parseAbiParameters('address, address, bytes32, uint32, bool, bytes32'), [
    c.verifier,
    c.family,
    c.dealId,
    c.revision,
    c.pass,
    c.evidenceHash,
  ]);
}

export function factBody(f: {
  op: 1 | 2;
  wallet: Address;
  factKind: Hex;
  level: number;
  evidenceSeal: Hex;
  expiresAt: number;
  factId: bigint;
}): Hex {
  return encodeAbiParameters(parseAbiParameters('uint8, address, bytes32, uint8, bytes32, uint64, uint256'), [
    f.op,
    f.wallet,
    f.factKind,
    f.level,
    f.evidenceSeal,
    BigInt(f.expiresAt),
    f.factId,
  ]);
}

export interface KeepCall {
  family: Address;
  selector: Hex;
  args: Hex;
}

export function keepBody(calls: KeepCall[]): Hex {
  return encodeAbiParameters(parseAbiParameters('(address family, bytes4 selector, bytes args)[]'), [calls]);
}

/// KarwanCheckVerifier's EIP-712 digest, the value the adapter approves.
export function checkDigest(c: CheckResult & { chainId: number }): Hex {
  return hashTypedData({
    domain: { name: 'KarwanCheckVerifier', version: '1', chainId: c.chainId, verifyingContract: c.verifier },
    types: {
      Report: [
        { name: 'family', type: 'address' },
        { name: 'dealId', type: 'bytes32' },
        { name: 'revision', type: 'uint32' },
        { name: 'pass', type: 'bool' },
        { name: 'evidenceHash', type: 'bytes32' },
      ],
    },
    primaryType: 'Report',
    message: { family: c.family, dealId: c.dealId, revision: c.revision, pass: c.pass, evidenceHash: c.evidenceHash },
  });
}

/// The timeouts each family lets anyone trigger; the same list the adapter is
/// deployed with (contracts/script/DeployCreAdapter.s.sol).
const KEEP_SIGNATURES = [
  'claim(bytes32)',
  'reclaim(bytes32)',
  'cancelMissed(bytes32)',
  'executeRuling(bytes32)',
  'applyFallback(bytes32)',
  'retryRecord(bytes32,uint8)',
  'settle(bytes32,uint16)',
  'close(bytes32)',
  'executeRuling(bytes32,uint16)',
  'applyFallback(bytes32,uint16)',
  'release(uint256)',
  'confirmRejection(uint256)',
  'claimRefund(uint256)',
  'executeRuling(uint256)',
  'applyFallback(uint256)',
] as const;

export type KeepSignature = (typeof KEEP_SIGNATURES)[number];

export const KEEP_SELECTORS = Object.fromEntries(
  KEEP_SIGNATURES.map((s) => [s, toFunctionSelector(s)]),
) as Record<KeepSignature, Hex>;
