import { encodeAbiParameters, getAddress, type Address, type Hex } from 'viem';
import { publicClient } from './client.js';

/// Collecting Safe approvals from owners that cannot produce a signature.
///
/// Two of the arbiter Safe's three owners are Circle smart accounts, not EOAs.
/// A Safe verifies an owner with `ecrecover`, so a contract owner has no
/// signature to give and the browser signing path (wagmi `signTypedData`) is
/// not merely inconvenient for them, it is impossible. With only one EOA owner
/// against a threshold of two, the Safe could not execute anything at all,
/// including changing its own owner set.
///
/// Safe 1.4.1 has a second route that fits exactly this: `approveHash`. An
/// owner records approval by SENDING A TRANSACTION rather than by signing, and
/// execution then presents a marker in place of a signature. Circle wallets
/// send transactions all day; that is the entire app. So the owner that cannot
/// sign can still approve.
///
/// EIP-1271 would also work and is worse here: it needs the contract-signature
/// blob encoded by hand and the owner to implement `isValidSignature` in the
/// exact shape Safe expects. `approveHash` needs one ordinary contract call.

export const SAFE_ABI = [
  { type: 'function', name: 'getOwners', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] },
  { type: 'function', name: 'getThreshold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nonce', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'approvedHashes',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'bytes32' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approveHash',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'bytes32', name: 'hashToApprove' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getTransactionHash',
    stateMutability: 'view',
    inputs: [
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'value' },
      { type: 'bytes', name: 'data' },
      { type: 'uint8', name: 'operation' },
      { type: 'uint256', name: 'safeTxGas' },
      { type: 'uint256', name: 'baseGas' },
      { type: 'uint256', name: 'gasPrice' },
      { type: 'address', name: 'gasToken' },
      { type: 'address', name: 'refundReceiver' },
      { type: 'uint256', name: '_nonce' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'execTransaction',
    stateMutability: 'payable',
    inputs: [
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'value' },
      { type: 'bytes', name: 'data' },
      { type: 'uint8', name: 'operation' },
      { type: 'uint256', name: 'safeTxGas' },
      { type: 'uint256', name: 'baseGas' },
      { type: 'uint256', name: 'gasPrice' },
      { type: 'address', name: 'gasToken' },
      { type: 'address', name: 'refundReceiver' },
      { type: 'bytes', name: 'signatures' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'addOwnerWithThreshold',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address', name: 'owner' },
      { type: 'uint256', name: '_threshold' },
    ],
    outputs: [],
  },
] as const;

/// One owner's contribution to the signature blob.
export type SafeApproval =
  | { kind: 'ecdsa'; owner: Address; signature: Hex }
  /// The owner called `approveHash` on chain. No signature exists; the blob
  /// carries a marker that tells the Safe to look up the stored approval.
  | { kind: 'approved'; owner: Address };

/// Assemble `execTransaction`'s `signatures` argument.
///
/// Safe walks this blob in order and requires each recovered owner to be
/// STRICTLY GREATER than the previous one. That is not a stylistic
/// preference: it is how the contract cheaply rejects the same owner counted
/// twice. Get the order wrong and a perfectly valid set of approvals reverts
/// with GS026, which reads like a bad signature rather than a bad sort.
///
/// Each entry is 65 bytes:
///   ECDSA     r, s, v      with v of 27 or 28
///   approved  owner, 0, 1  v of 1 means "check approvedHashes[owner][hash]"
export function encodeSafeSignatures(approvals: readonly SafeApproval[]): Hex {
  const sorted = [...approvals].sort((a, b) =>
    getAddress(a.owner).toLowerCase() < getAddress(b.owner).toLowerCase() ? -1 : 1,
  );

  let blob = '0x';
  for (const a of sorted) {
    if (a.kind === 'ecdsa') {
      blob += a.signature.slice(2);
      continue;
    }
    // r = the owner address, left-padded to 32 bytes. s = 0. v = 1.
    const r = encodeAbiParameters([{ type: 'address' }], [getAddress(a.owner)]).slice(2);
    const s = '0'.repeat(64);
    const v = '01';
    blob += r + s + v;
  }
  return blob as Hex;
}

export interface SafeTx {
  to: Address;
  value: bigint;
  data: Hex;
  operation: number;
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: Address;
  refundReceiver: Address;
  nonce: bigint;
}

const ZERO = '0x0000000000000000000000000000000000000000' as Address;

/// A plain call from the Safe, with every gas-refund field zeroed. The relay
/// pays gas, so the Safe never needs to reimburse anyone.
export function buildSafeTx(to: Address, data: Hex, nonce: bigint): SafeTx {
  return {
    to,
    value: 0n,
    data,
    operation: 0,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ZERO,
    refundReceiver: ZERO,
    nonce,
  };
}

/// The digest owners approve or sign. Read from the Safe rather than computed
/// locally: the contract is the authority on its own domain separator, and a
/// locally derived hash that disagrees produces signatures that verify against
/// nothing.
export async function safeTxHash(safe: Address, tx: SafeTx): Promise<Hex> {
  return (await publicClient.readContract({
    address: safe,
    abi: SAFE_ABI,
    functionName: 'getTransactionHash',
    args: [
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver,
      tx.nonce,
    ],
  })) as Hex;
}

export async function readSafe(safe: Address): Promise<{
  owners: Address[];
  threshold: bigint;
  nonce: bigint;
}> {
  const [owners, threshold, nonce] = (await Promise.all([
    publicClient.readContract({ address: safe, abi: SAFE_ABI, functionName: 'getOwners' }),
    publicClient.readContract({ address: safe, abi: SAFE_ABI, functionName: 'getThreshold' }),
    publicClient.readContract({ address: safe, abi: SAFE_ABI, functionName: 'nonce' }),
  ])) as [Address[], bigint, bigint];
  return { owners, threshold, nonce };
}

export async function hasApproved(safe: Address, owner: Address, hash: Hex): Promise<boolean> {
  const v = (await publicClient.readContract({
    address: safe,
    abi: SAFE_ABI,
    functionName: 'approvedHashes',
    args: [owner, hash],
  })) as bigint;
  return v === 1n;
}

/// Is this address an owner? Compared checksummed, because a lowercase string
/// from a form or an env var never matches a checksummed one from the chain.
export function isOwner(owners: readonly Address[], candidate: string): boolean {
  let target: string;
  try {
    target = getAddress(candidate);
  } catch {
    return false;
  }
  return owners.some((o) => getAddress(o) === target);
}
