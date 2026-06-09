import { recoverTypedDataAddress, type Address, type Hex } from 'viem';
import { executeContractCall } from './txs.js';
import { config } from '../config.js';

/// Native USDC EIP-3009 helpers for the factoring settlement rail.
///
/// Arc Testnet USDC (0x3600...0000) is full Circle USDC v2: domain
/// {name: 'USDC', version: '2'} verified against the on-chain
/// DOMAIN_SEPARATOR, and TRANSFER_WITH_AUTHORIZATION_TYPEHASH matches the
/// canonical EIP-3009 hash. A web3 party signs a TransferWithAuthorization
/// once (works with a zero balance at signing time); the platform relay
/// submits it later when the funds exist. Gateway batching is NOT used
/// here on purpose: Gateway debits a pre-funded deposit and rejects SCA
/// signatures, which makes it unusable for a seller who has no liquidity
/// at signing time. Native EIP-3009 has neither constraint.

const ARC_CHAIN_ID = 5042002;

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

export function usdcDomain() {
  return {
    name: 'USDC',
    version: '2',
    chainId: ARC_CHAIN_ID,
    verifyingContract: config.USDC_ADDR as Address,
  } as const;
}

/// One signed transfer authorization, exactly as stored on a factoring
/// offer. value is atomic USDC (6dp); validAfter/validBefore are unix
/// seconds as decimal strings; nonce is random 32 bytes.
export interface UsdcTransferAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  signature: string;
}

/// Server-side validation of a client-submitted authorization: field
/// expectations plus an actual signature recovery, so a tampered or
/// mis-signed authorization is rejected at the API boundary instead of
/// reverting on chain months later.
export async function verifyTransferAuthorization(
  auth: UsdcTransferAuthorization,
  expected: {
    from: string;
    to: string;
    valueAtomic: string;
    /// The authorization must stay valid at least until this unix-seconds
    /// instant, or the settlement instrument expires before it can fire.
    validUntil: number;
  },
): Promise<string | null> {
  if (auth.from.toLowerCase() !== expected.from.toLowerCase()) {
    return 'authorization.from does not match the expected payer';
  }
  if (auth.to.toLowerCase() !== expected.to.toLowerCase()) {
    return 'authorization.to does not match the expected recipient';
  }
  if (auth.value !== expected.valueAtomic) {
    return `authorization.value must be ${expected.valueAtomic} (atomic USDC)`;
  }
  if (Number(auth.validAfter) > Math.floor(Date.now() / 1000)) {
    return 'authorization is not valid yet';
  }
  if (Number(auth.validBefore) < expected.validUntil) {
    return 'authorization expires too early to cover settlement';
  }
  try {
    const recovered = await recoverTypedDataAddress({
      domain: usdcDomain(),
      types: USDC_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: auth.from as Address,
        to: auth.to as Address,
        value: BigInt(auth.value),
        validAfter: BigInt(auth.validAfter),
        validBefore: BigInt(auth.validBefore),
        nonce: auth.nonce as Hex,
      },
      signature: auth.signature as Hex,
    });
    if (recovered.toLowerCase() !== auth.from.toLowerCase()) {
      return 'signature does not recover to authorization.from';
    }
  } catch {
    return 'malformed signature';
  }
  return null;
}

/// Submit a stored authorization on the USDC contract from the platform
/// relay wallet. Real USDC moves from auth.from to auth.to; the payer
/// signed offchain, the relay pays gas. Replaying a used nonce reverts on
/// chain, so retries after an ambiguous failure are safe.
export async function submitTransferWithAuthorization(
  auth: UsdcTransferAuthorization,
  label: string,
): Promise<{ txHash: string }> {
  const relayWalletId = config.cctpRelayWalletId;
  if (!relayWalletId) {
    throw new Error('CCTP_RELAY_WALLET_ID is not configured; cannot relay EIP-3009');
  }
  const sig = auth.signature;
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    throw new Error('expected a 65-byte signature');
  }
  const r = sig.slice(0, 66);
  const s = `0x${sig.slice(66, 130)}`;
  let v = parseInt(sig.slice(130, 132), 16);
  if (v < 27) v += 27;

  const { txHash } = await executeContractCall(
    {
      walletId: relayWalletId,
      contractAddress: config.USDC_ADDR,
      abiFunctionSignature:
        'transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)',
      abiParameters: [
        auth.from,
        auth.to,
        auth.value,
        auth.validAfter,
        auth.validBefore,
        auth.nonce,
        v,
        r,
        s,
      ],
    },
    label,
  );
  return { txHash };
}

/// Direct USDC transfer from a Circle developer-controlled wallet. Used
/// for parties whose identity wallet the backend signs for (email and
/// passkey users): no offchain authorization is needed, the platform
/// moves the funds when the settlement condition is met.
export async function transferFromCircleWallet(
  walletId: string,
  to: string,
  valueAtomic: string,
  label: string,
  idempotencyKey?: string,
): Promise<{ txHash: string }> {
  const { txHash } = await executeContractCall(
    {
      walletId,
      contractAddress: config.USDC_ADDR,
      abiFunctionSignature: 'transfer(address,uint256)',
      abiParameters: [to, valueAtomic],
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
    label,
  );
  return { txHash };
}
