import test from 'node:test';
import assert from 'node:assert/strict';
import { withWorkspaceDefaults } from './workspaces.js';
import type { UserProfile } from './profiles.js';

const baseProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  address: '0x1111111111111111111111111111111111111111',
  role: 'both',
  displayName: 'Amina',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

test('provisions one personal workspace against the identity wallet', () => {
  const result = withWorkspaceDefaults(baseProfile());
  assert.equal(result.workspaces?.length, 1);
  assert.equal(result.workspaces?.[0]?.kind, 'personal');
  assert.equal(result.workspaces?.[0]?.walletAddress, baseProfile().address);
  assert.equal(result.workspaces?.[0]?.balanceScope, 'identity');
  assert.equal(result.workspaceMemberships?.[0]?.role, 'owner');
});

test('projects an existing legacy business profile into an owner workspace without another wallet', () => {
  const result = withWorkspaceDefaults(baseProfile({
    accountKind: 'business',
    smeProfile: { companyName: 'Amina Foods', sector: 'agriculture' },
    business: { status: 'verified', verifiedAt: 1_700_000_100_000 },
  }));
  const business = result.workspaces?.find((workspace) => workspace.kind === 'business');
  assert.ok(business);
  assert.equal(business.name, 'Amina Foods');
  assert.equal(business.business?.verificationStatus, 'verified');
  assert.equal(business.walletAddress, baseProfile().address);
  assert.equal(result.workspaceMemberships?.filter((membership) => membership.role === 'owner').length, 2);
});

test('keeps user-created workspace records stable across migration reads', () => {
  const first = withWorkspaceDefaults(baseProfile());
  const second = withWorkspaceDefaults(first);
  assert.deepEqual(second.workspaces, first.workspaces);
  assert.deepEqual(second.workspaceMemberships, first.workspaceMemberships);
});
