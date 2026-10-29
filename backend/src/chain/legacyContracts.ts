import { decodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters, type Address, type Hex } from 'viem';
import type { DeployedContract } from './deployLedger.js';

/// Every older Karwan contract that can still hold a person's money (view 37).
/// The list comes from the deploy ledger, so a contract replaced later joins the
/// legacy page by being in the ledger, with no setting to add.

export type EscrowVersion = 'v0' | 'pre-v2d' | 'v2d' | 'v2e';

/// One state language for every version. v2.D's Accepted means still funded.
export const LEGACY_STATE = { None: 0, Funded: 1, Settled: 2, Disputed: 3, Refunded: 4 } as const;
export type LegacyState = (typeof LEGACY_STATE)[keyof typeof LEGACY_STATE];

export interface LegacyDeal {
  buyer: Address;
  seller: Address;
  /// What the deal still holds: the amount less what was already paid out.
  lockedMicros: bigint;
  state: LegacyState;
}

export function olderContracts(ledger: readonly DeployedContract[], live: { escrow?: string | null }): { escrows: Address[]; vaults: Address[] } {
  const liveEscrow = live.escrow?.toLowerCase();
  const escrows = ledger.filter((c) => c.name === 'KarwanEscrow' && c.address.toLowerCase() !== liveEscrow).map((c) => c.address.toLowerCase() as Address);
  // Every vault, including the one guarantees are moving off (decision 6).
  const vaults = ledger.filter((c) => c.name === 'KarwanVault').map((c) => c.address.toLowerCase() as Address);
  return { escrows, vaults };
}

/// The public `escrows(bytes32)` getter grew a field with each version, and its
/// width is how the deployed version is told apart.
const BY_WIDTH: Record<number, EscrowVersion> = { 6: 'v0', 9: 'pre-v2d', 10: 'v2d', 11: 'v2e' };

export function escrowVersionForWidth(words: number): EscrowVersion | null {
  return BY_WIDTH[words] ?? null;
}

const LAYOUT: Record<EscrowVersion, string> = {
  v0: 'address,address,uint256,uint256,uint8,uint8',
  'pre-v2d': 'address,address,uint256,uint256,uint256,uint256,uint256,uint8,uint8',
  v2d: 'address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8',
  v2e: 'address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,uint16',
};

/// v2.D enum: None, Funded, Accepted, Settled, Disputed, Refunded.
function fromV2d(s: number): LegacyState {
  return ([LEGACY_STATE.None, LEGACY_STATE.Funded, LEGACY_STATE.Funded, LEGACY_STATE.Settled, LEGACY_STATE.Disputed, LEGACY_STATE.Refunded][s] ?? LEGACY_STATE.None) as LegacyState;
}

export function decodeLegacyEscrow(version: EscrowVersion, data: Hex): LegacyDeal | null {
  const v = decodeAbiParameters(parseAbiParameters(LAYOUT[version]), data) as readonly unknown[];
  const buyer = (v[0] as string).toLowerCase() as Address;
  const seller = (v[1] as string).toLowerCase() as Address;
  const amount = v[2] as bigint;
  let released: bigint;
  let state: LegacyState;
  if (version === 'v0') {
    released = v[3] as bigint;
    state = Number(v[5]) as LegacyState;
  } else if (version === 'pre-v2d') {
    released = v[5] as bigint;
    state = Number(v[8]) as LegacyState;
  } else {
    released = v[5] as bigint;
    state = fromV2d(Number(v[9]));
  }
  if (state === LEGACY_STATE.None) return null;
  return { buyer, seller, lockedMicros: amount > released ? amount - released : 0n, state };
}

export type VaultStep = 'requestWithdraw' | 'cancelWithdraw' | 'claim';
export type DealStep = 'releaseFinal' | 'refund';

/// Older vault position states: 1 active, 2 coming back, 3 collected.
export function vaultSteps(p: { state: number; claimableAt: number }, nowSecs: number): VaultStep[] {
  if (p.state === 1) return ['requestWithdraw'];
  if (p.state === 2) return nowSecs >= p.claimableAt ? ['claim', 'cancelWithdraw'] : ['cancelWithdraw'];
  return [];
}

/// Only the buyer signs on an older escrow: release to the seller, or take the
/// money back (a dispute first where the deal is still funded; the oldest
/// contracts let anyone refund a disputed deal). The seller waits for the buyer.
export function dealSteps(d: LegacyDeal, role: 'buyer' | 'seller'): DealStep[] {
  if (role !== 'buyer' || d.lockedMicros === 0n) return [];
  if (d.state === LEGACY_STATE.Funded) return ['releaseFinal', 'refund'];
  if (d.state === LEGACY_STATE.Disputed) return ['refund'];
  return [];
}

export const legacyVaultAbi = parseAbi([
  'function nextPositionId() view returns (uint256)',
  'function positions(uint256) view returns (address owner, uint256 principal, uint64 depositedAt, uint64 cooldownStartedAt, uint64 claimableAt, uint8 state)',
  'function requestWithdraw(uint256 positionId)',
  'function cancelWithdraw(uint256 positionId)',
  'function claim(uint256 positionId)',
]);

export const legacyEscrowAbi = parseAbi([
  'function escrows(bytes32 jobId) view returns (uint256)',
  'function releaseFinal(bytes32 jobId)',
  'function dispute(bytes32 jobId, string reasonHash)',
  'function refund(bytes32 jobId)',
]);

export interface Call {
  to: Address;
  data: Hex;
}

export function vaultStepCall(vault: Address, step: VaultStep, positionId: bigint): Call {
  return { to: vault, data: encodeFunctionData({ abi: legacyVaultAbi, functionName: step, args: [positionId] }) };
}

/// The calls for a deal step, in order. A refund on a funded deal disputes it
/// first, because every older escrow refunds only a disputed deal.
export function dealStepCalls(escrow: Address, step: DealStep, jobId: Hex, d: LegacyDeal): Call[] {
  if (step === 'releaseFinal') return [{ to: escrow, data: encodeFunctionData({ abi: legacyEscrowAbi, functionName: 'releaseFinal', args: [jobId] }) }];
  const refund = { to: escrow, data: encodeFunctionData({ abi: legacyEscrowAbi, functionName: 'refund', args: [jobId] }) };
  if (d.state !== LEGACY_STATE.Funded) return [refund];
  return [{ to: escrow, data: encodeFunctionData({ abi: legacyEscrowAbi, functionName: 'dispute', args: [jobId, 'Recovery from an older contract'] }) }, refund];
}
