import { parseUsdcMicro } from '../matching/money.js';

export interface StakeRequirement {
  requirementVersion: number;
  requiredStakeUsdc: string;
  stakeOwner: string;
  fundingWallet: string;
  vaultAddress: string;
  asset: 'USDC';
  network: string;
}

export interface StakeSnapshot {
  freeStakeUsdc: string;
  liquidFundingUsdc: string;
  dealRoomOpen: boolean;
  mandateVersion: number;
  expectedRequirementVersion: number;
}

export interface StakePolicy {
  autonomousMaxUsdc: string;
  allowedVaults: readonly string[];
  allowedNetworks: readonly string[];
  allowedAssets: readonly string[];
}

export type StakeDecision =
  | { outcome: 'already_qualified'; reason: 'SUFFICIENT_FREE_STAKE'; requirementVersion: number }
  | { outcome: 'auto_authorized'; amountUsdc: string; shortfallUsdc: string; requirementVersion: number }
  | { outcome: 'approval_required'; amountUsdc: string; shortfallUsdc: string; reason: 'AUTONOMOUS_LIMIT_EXCEEDED'; requirementVersion: number }
  | { outcome: 'funding_required'; amountUsdc: string; shortfallUsdc: string; reason: 'INSUFFICIENT_LIQUID_FUNDS'; requirementVersion: number }
  | { outcome: 'blocked'; reason: 'DEAL_CLOSED' | 'STALE_REQUIREMENT' | 'DESTINATION_NOT_ALLOWLISTED' | 'NETWORK_NOT_ALLOWLISTED' | 'ASSET_NOT_ALLOWLISTED' };

export function decideStakeQualification(requirement: StakeRequirement, snapshot: StakeSnapshot, policy: StakePolicy): StakeDecision {
  if (!snapshot.dealRoomOpen) return { outcome: 'blocked', reason: 'DEAL_CLOSED' };
  if (snapshot.expectedRequirementVersion !== requirement.requirementVersion) return { outcome: 'blocked', reason: 'STALE_REQUIREMENT' };
  if (!policy.allowedVaults.map((value) => value.toLowerCase()).includes(requirement.vaultAddress.toLowerCase())) {
    return { outcome: 'blocked', reason: 'DESTINATION_NOT_ALLOWLISTED' };
  }
  if (!policy.allowedNetworks.includes(requirement.network)) return { outcome: 'blocked', reason: 'NETWORK_NOT_ALLOWLISTED' };
  if (!policy.allowedAssets.includes(requirement.asset)) return { outcome: 'blocked', reason: 'ASSET_NOT_ALLOWLISTED' };
  const required = parseUsdcMicro(requirement.requiredStakeUsdc);
  const free = parseUsdcMicro(snapshot.freeStakeUsdc);
  const liquid = parseUsdcMicro(snapshot.liquidFundingUsdc);
  if (free >= required) return { outcome: 'already_qualified', reason: 'SUFFICIENT_FREE_STAKE', requirementVersion: requirement.requirementVersion };
  const shortfall = required - free;
  const shortfallText = format(shortfall);
  if (liquid < shortfall) return { outcome: 'funding_required', amountUsdc: format(required), shortfallUsdc: shortfallText, reason: 'INSUFFICIENT_LIQUID_FUNDS', requirementVersion: requirement.requirementVersion };
  if (shortfall > parseUsdcMicro(policy.autonomousMaxUsdc)) return { outcome: 'approval_required', amountUsdc: format(required), shortfallUsdc: shortfallText, reason: 'AUTONOMOUS_LIMIT_EXCEEDED', requirementVersion: requirement.requirementVersion };
  return { outcome: 'auto_authorized', amountUsdc: format(required), shortfallUsdc: shortfallText, requirementVersion: requirement.requirementVersion };
}

function format(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
