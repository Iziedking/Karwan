/// Minimal ABI for the v2.D KarwanEscrow when it becomes a Gen 3 legacy
/// contract under v2.E. Same recovery surface as the pre-v2.D legacy ABI but
/// the storage layout has one extra field (`reservedAmount`) that shifted
/// `milestonesReleased` and `state` down a slot. The auto-getter tuple is
/// therefore 11 fields wide; reading with the pre-v2.D 9-field ABI mis-aligns
/// the state byte.
///
/// State enum on v2.D:
///   None=0, Funded=1, Accepted=2, Settled=3, Disputed=4, Refunded=5
/// The reader in chain/contracts.ts maps this to the legacy enum shape so
/// downstream code (legacy routes, UI) keeps treating "Funded" and
/// "Disputed" the same regardless of source generation.
export const v2dEscrowAbi = [
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
      { name: 'reservedAmount', type: 'uint256' },
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
    name: 'releaseFinal',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'releaseFromDispute',
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

/// State enum on v2.D, kept here so the legacy reader can map between the
/// v2.D shape and the older legacy shape that downstream code expects.
export const V2D_ESCROW_STATE = {
  None: 0,
  Funded: 1,
  Accepted: 2,
  Settled: 3,
  Disputed: 4,
  Refunded: 5,
} as const;
