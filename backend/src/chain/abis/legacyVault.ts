/// Minimal ABI for the pre-v2.D KarwanVault contract. The active vault
/// (v2.D) added `nextPositionId`, `activeStakeOf`, `freeStakeOf`, and the
/// reservation surface. The legacy contract has none of those, so reads
/// against it have to find positions through the Deposited event log, not
/// through a counter view.
///
/// Position state enum on the legacy contract matches v2.D:
///   None=0, Active=1, Cooling=2, Withdrawn=3
export const legacyVaultAbi = [
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'principal', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'principal', type: 'uint256' },
      { name: 'depositedAt', type: 'uint64' },
      { name: 'cooldownStartedAt', type: 'uint64' },
      { name: 'claimableAt', type: 'uint64' },
      { name: 'state', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'COOLDOWN_DAYS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'requestWithdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelWithdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
] as const;
