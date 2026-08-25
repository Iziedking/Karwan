import assert from 'node:assert/strict';
import test from 'node:test';
import { decideStakeQualification } from './policy.js';

const requirement = { requirementVersion: 5, requiredStakeUsdc: '500', stakeOwner: '0x1111111111111111111111111111111111111111', fundingWallet: '0x2222222222222222222222222222222222222222', vaultAddress: '0x3333333333333333333333333333333333333333', asset: 'USDC' as const, network: 'arc-testnet' };
const policy = { autonomousMaxUsdc: '250', allowedVaults: [requirement.vaultAddress], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] };

test('free stake qualifies without a new financial action', () => {
  assert.deepEqual(decideStakeQualification(requirement, { freeStakeUsdc: '500', liquidFundingUsdc: '0', dealRoomOpen: true, mandateVersion: 2, expectedRequirementVersion: 5 }, policy), { outcome: 'already_qualified', reason: 'SUFFICIENT_FREE_STAKE', requirementVersion: 5 });
});

test('sufficient authorized liquidity can auto-authorize only within the exact limit', () => {
  const decision = decideStakeQualification(requirement, { freeStakeUsdc: '250', liquidFundingUsdc: '250', dealRoomOpen: true, mandateVersion: 2, expectedRequirementVersion: 5 }, policy);
  assert.equal(decision.outcome, 'auto_authorized');
  assert.equal(decision.shortfallUsdc, '250');
  const approval = decideStakeQualification({ ...requirement, requiredStakeUsdc: '600' }, { freeStakeUsdc: '250', liquidFundingUsdc: '350', dealRoomOpen: true, mandateVersion: 2, expectedRequirementVersion: 5 }, policy);
  assert.equal(approval.outcome, 'approval_required');
});

test('insufficient funds creates an exact blocker and closed deals never resume staking', () => {
  const funding = decideStakeQualification(requirement, { freeStakeUsdc: '100', liquidFundingUsdc: '200', dealRoomOpen: true, mandateVersion: 2, expectedRequirementVersion: 5 }, policy);
  assert.equal(funding.outcome, 'funding_required');
  if (funding.outcome === 'funding_required') assert.equal(funding.shortfallUsdc, '400');
  assert.deepEqual(decideStakeQualification(requirement, { freeStakeUsdc: '0', liquidFundingUsdc: '500', dealRoomOpen: false, mandateVersion: 2, expectedRequirementVersion: 5 }, policy), { outcome: 'blocked', reason: 'DEAL_CLOSED' });
});
