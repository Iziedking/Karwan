import { formatUnits, parseUnits } from 'viem';
import type { StakeQualificationShadowTaskData } from './stakeQualificationShadow.js';

export interface StakeQualificationProjectionInput {
  dealRoomId: string;
  sellerAddress: string;
  stakeOwner: string;
  fundingWallet: string;
  vaultAddress: string;
  requiredStakeUsdc: string;
  freeStakeUsdc: string;
  reservationBps: number;
  observedAtUnix: number;
}

/**
 * Build the seller-gate observation without importing seller runtime state.
 * The projection records an exact shortfall and a non-executable policy; it
 * never represents a transaction submission or an approval execution.
 */
export function buildStakeQualificationObservation(
  input: StakeQualificationProjectionInput,
): StakeQualificationShadowTaskData {
  const requirementVersion = 1;
  const sellerAddress = input.sellerAddress.toLowerCase();
  const dealRoomId = input.dealRoomId.trim();
  const blockerKey = `stake:${dealRoomId}:${sellerAddress}:requirement:${requirementVersion}`;
  const required = parseUnits(input.requiredStakeUsdc, 6);
  const free = parseUnits(input.freeStakeUsdc, 6);
  if (required <= free) throw new Error('stake shortfall projection requires free stake below requirement');
  return {
    dealRoomId,
    idempotencyKey: `${blockerKey}:observed`,
    observedAtUnix: input.observedAtUnix,
    source: 'matching-shadow',
    confirmedFunding: false,
    requirement: {
      requirementVersion,
      requiredStakeUsdc: input.requiredStakeUsdc,
      stakeOwner: input.stakeOwner.toLowerCase(),
      fundingWallet: input.fundingWallet.toLowerCase(),
      vaultAddress: input.vaultAddress.toLowerCase(),
      asset: 'USDC',
      network: 'arc-testnet',
    },
    snapshot: {
      freeStakeUsdc: input.freeStakeUsdc,
      liquidFundingUsdc: '0',
      dealRoomOpen: true,
      mandateVersion: 1,
      expectedRequirementVersion: requirementVersion,
    },
    policy: {
      autonomousMaxUsdc: '0',
      allowedVaults: [input.vaultAddress.toLowerCase()],
      allowedNetworks: ['arc-testnet'],
      allowedAssets: ['USDC'],
    },
    blocker: {
      id: `blocker:${blockerKey}`,
      blockerKey,
      kind: 'STAKE_SHORTFALL',
      subject: input.sellerAddress,
      data: {
        requiredStakeUsdc: input.requiredStakeUsdc,
        freeStakeUsdc: input.freeStakeUsdc,
        shortfallUsdc: formatUnits(required - free, 6),
        reservationBps: input.reservationBps,
        mode: 'read-only-shadow',
      },
    },
  };
}
