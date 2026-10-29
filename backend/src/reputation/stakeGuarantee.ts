import { formatUnits, type Hex } from 'viem';
import { publicClient } from '../chain/client.js';
import { usdc } from '../chain/contracts.js';
import { guaranteeState, guaranteeVaultAbi } from '../chain/guaranteeVault.js';
import { guaranteeVaultEnabled } from '../chain/suiteConfig.js';
import { listActivityForAddress } from '../db/activityLog.js';
import { suiteIdentity } from '../identity/suiteIdentityLive.js';

/// A Deal guarantee on the family vault counts toward reputation as a stake on
/// the previous vault does (view 37, decision 4). Its time starts when it was
/// put up; time on the previous vault does not carry over.

export interface StakeSummary {
  stakeUsdc: number;
  freeStakeUsdc: number;
  reservedUsdc: number;
  stakeDays: number;
}

export interface GuaranteeForStake {
  /// The guarantee less what is coming back, as the previous vault counts only
  /// positions that are not cooling.
  inPlaceUsdc: number;
  heldUsdc: number;
  sinceSecs: number | null;
}

export function withGuarantee(summary: StakeSummary, g: GuaranteeForStake | null, nowSecs: number): StakeSummary {
  if (!g || g.inPlaceUsdc <= 0) return summary;
  const stakeUsdc = summary.stakeUsdc + g.inPlaceUsdc;
  const reservedUsdc = summary.reservedUsdc + g.heldUsdc;
  const days = g.sinceSecs === null ? 0 : Math.max(0, (nowSecs - g.sinceSecs) / 86_400);
  return {
    stakeUsdc,
    freeStakeUsdc: Math.max(0, stakeUsdc - reservedUsdc),
    reservedUsdc,
    stakeDays: Math.max(summary.stakeDays, days),
  };
}

/// Reads stay inside the activity rows Karwan wrote, so a very active account
/// whose first put up has scrolled past this window reads a shorter time,
/// never a longer one.
const ACTIVITY_WINDOW = 1_000;

export async function readGuaranteeForStake(address: string): Promise<GuaranteeForStake | null> {
  const vault = guaranteeVaultEnabled();
  if (!vault || !suiteIdentity) return null;
  const { identityId } = await suiteIdentity.identityStatus(address);
  if (identityId === 0n) return null;
  const [stake, free, rows] = await Promise.all([
    publicClient.readContract({ address: vault, abi: guaranteeVaultAbi, functionName: 'stakeOf', args: [identityId, usdc as Hex] }),
    publicClient.readContract({ address: vault, abi: guaranteeVaultAbi, functionName: 'freeOf', args: [identityId, usdc as Hex] }),
    listActivityForAddress(address, 0, ACTIVITY_WINDOW).catch(() => []),
  ]);
  const state = guaranteeState(stake, free, Math.floor(Date.now() / 1000));
  const putUps = rows.filter((r) => r.params?.t === 'guaranteePutUp').map((r) => r.ts);
  return {
    inPlaceUsdc: Number(formatUnits(state.inPlaceMicros, 6)),
    heldUsdc: Number(formatUnits(state.heldMicros, 6)),
    sinceSecs: putUps.length ? Math.floor(Math.min(...putUps) / 1000) : null,
  };
}
