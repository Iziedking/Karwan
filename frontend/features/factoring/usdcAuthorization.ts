import { parseUnits, toHex } from 'viem';
import { ARC_CHAIN_ID, ARC_USDC_ADDRESS } from '@/features/profile/config';
import type { UsdcAuthorization } from '@/core/api';

/// USDC EIP-3009 TransferWithAuthorization typed data for Arc Testnet.
/// Domain verified byte-for-byte against the on-chain DOMAIN_SEPARATOR
/// (name USDC, version 2). A web3 party signs once; the platform relay
/// submits when the settlement condition is met. Signing needs no balance
/// and no gas.

export const USDC_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export function buildTransferAuthorization({
  from,
  to,
  valueUsdc,
  validForSeconds,
}: {
  from: `0x${string}`;
  to: `0x${string}`;
  /// Decimal USDC string, e.g. "9.800000".
  valueUsdc: string;
  validForSeconds: number;
}) {
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  return {
    domain: {
      name: 'USDC',
      version: '2',
      chainId: ARC_CHAIN_ID,
      verifyingContract: ARC_USDC_ADDRESS,
    },
    types: USDC_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization' as const,
    message: {
      from,
      to,
      value: parseUnits(valueUsdc, 6),
      validAfter: 0n,
      validBefore: BigInt(Math.floor(Date.now() / 1000) + validForSeconds),
      nonce: toHex(nonceBytes),
    },
  };
}

/// Project the signed typed data into the wire shape the backend stores.
export function serializeAuthorization(
  message: ReturnType<typeof buildTransferAuthorization>['message'],
  signature: string,
): UsdcAuthorization {
  return {
    from: message.from,
    to: message.to,
    value: message.value.toString(),
    validAfter: message.validAfter.toString(),
    validBefore: message.validBefore.toString(),
    nonce: message.nonce,
    signature,
  };
}
