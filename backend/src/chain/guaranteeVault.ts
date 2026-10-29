import { parseAbi } from 'viem';

/// The family vault that holds Deal guarantees (view 37). A guarantee belongs to
/// an identity, never to a wallet, so every read is keyed by the identity id.
export const guaranteeVaultAbi = parseAbi([
  'struct Stake { uint128 active; uint128 reserved; uint128 cooling; uint64 coolUntil; }',
  'function stake(address asset, uint256 amount)',
  'function requestWithdraw(address asset, uint256 amount)',
  'function cancelWithdraw(address asset)',
  'function withdraw(address asset)',
  'function stakeOf(uint64 owner, address asset) view returns (Stake)',
  'function freeOf(uint64 owner, address asset) view returns (uint256)',
  'function COOLDOWN() view returns (uint64)',
  'function hub() view returns (address)',
  'event Staked(uint64 indexed owner, address indexed asset, address indexed from, uint256 amount)',
  'event WithdrawRequested(uint64 indexed owner, address indexed asset, uint256 amount, uint64 claimableAt)',
  'event WithdrawCancelled(uint64 indexed owner, address indexed asset)',
  'event Withdrawn(uint64 indexed owner, address indexed asset, address indexed to, uint256 amount)',
]);

export interface VaultStake {
  active: bigint;
  reserved: bigint;
  cooling: bigint;
  coolUntil: bigint;
}

export interface GuaranteeState {
  /// Everything still protecting buyers: the guarantee less what is coming back.
  inPlaceMicros: bigint;
  /// The part deals and advances hold until they finish.
  heldMicros: bigint;
  /// What can be taken out now (the vault's own `freeOf`).
  freeMicros: bigint;
  comingBackMicros: bigint;
  /// Unix seconds when what is coming back can be collected.
  readyAt: number | null;
  ready: boolean;
}

/// `active` already includes what is reserved and what is cooling.
export function guaranteeState(stake: VaultStake, freeMicros: bigint, nowSecs: number): GuaranteeState {
  const comingBack = stake.cooling;
  const readyAt = comingBack > 0n ? Number(stake.coolUntil) : null;
  return {
    inPlaceMicros: stake.active > comingBack ? stake.active - comingBack : 0n,
    heldMicros: stake.reserved,
    freeMicros,
    comingBackMicros: comingBack,
    readyAt,
    ready: readyAt !== null && nowSecs >= readyAt,
  };
}
