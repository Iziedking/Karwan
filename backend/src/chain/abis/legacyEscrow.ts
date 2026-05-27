/// Minimal ABI for the pre-v2.D KarwanEscrow contract. Only the fields and
/// functions the 30-day recovery surface needs:
///   - `escrows(jobId)` auto-getter (drops dynamic arrays; tuple shape below)
///   - `refund(jobId)` for buyer-side reclaim after a missed deadline
///   - `proposeCancellation(jobId, reason)` + `acceptCancellation(jobId)`
///     for mutual cancel paths
///   - Legacy `EscrowState` enum: None=0, Funded=1, Settled=2, Disputed=3,
///     Refunded=4. No Accepted state — pre-v2.D didn't have the seller-side
///     acceptEscrow handshake; the off-chain deal record carried that.
export const legacyEscrowAbi = [
  {
    type: 'function',
    name: 'escrows',
    stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'bytes32' }],
    outputs: [
      { name: 'buyer', type: 'address' },
      { name: 'seller', type: 'address' },
      { name: 'dealAmount', type: 'uint256' },
      { name: 'sellerNet', type: 'uint256' },
      { name: 'feeTotal', type: 'uint256' },
      { name: 'released', type: 'uint256' },
      { name: 'feeReleased', type: 'uint256' },
      { name: 'milestonesReleased', type: 'uint8' },
      { name: 'state', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'proposeCancellation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'bytes32' },
      { name: 'reason', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'acceptCancellation',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'releaseProgress',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'bytes32' },
      { name: 'milestoneIndex', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'releaseFinal',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'dispute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'bytes32' },
      { name: 'reasonHash', type: 'string' },
    ],
    outputs: [],
  },
] as const;

export const LEGACY_ESCROW_STATE = {
  None: 0,
  Funded: 1,
  Settled: 2,
  Disputed: 3,
  Refunded: 4,
} as const;
