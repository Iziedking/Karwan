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

test('a business account opens on its business workspace and can switch to a personal one', () => {
  const result = withWorkspaceDefaults(baseProfile({
    accountKind: 'business',
    smeProfile: { companyName: 'Amina Foods', sector: 'agriculture' },
    business: { status: 'verified', verifiedAt: 1_700_000_100_000 },
  }));
  assert.deepEqual(result.workspaces?.map((workspace) => workspace.kind), ['business', 'personal']);
  const business = result.workspaces?.[0];
  assert.equal(business?.name, 'Amina Foods');
  assert.equal(business?.business?.verificationStatus, 'verified');
  assert.equal(business?.walletAddress, baseProfile().address);
  assert.equal(result.workspaces?.[1]?.name, 'Amina');
  assert.equal(result.workspaceMemberships?.filter((membership) => membership.role === 'owner').length, 2);
  // Reading it again changes nothing.
  assert.deepEqual(withWorkspaceDefaults(result).workspaces, result.workspaces);
});

test('the personal workspace of a business account never takes the company name', () => {
  const result = withWorkspaceDefaults(baseProfile({
    accountKind: 'business',
    displayName: 'Amina Foods',
    handle: 'amina',
    smeProfile: { companyName: 'Amina Foods', sector: 'agriculture' },
  }));
  assert.equal(result.workspaces?.find((workspace) => workspace.kind === 'personal')?.name, '@amina');
});

test('keeps a linked business workspace beside a personal identity workspace', () => {
  const initial = withWorkspaceDefaults(baseProfile());
  const result = withWorkspaceDefaults({
    ...initial,
    workspaces: [
      ...(initial.workspaces ?? []),
      {
        id: 'business:linked',
        kind: 'business',
        name: 'Amina Foods',
        status: 'setup',
        ownerAddress: baseProfile().address.toLowerCase(),
        walletAddress: baseProfile().address.toLowerCase(),
        balanceScope: 'identity',
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        business: { legalName: 'Amina Foods', verificationStatus: 'not_started' },
      },
    ],
  });
  assert.deepEqual(result.workspaces?.map((workspace) => workspace.kind), ['personal', 'business']);
  assert.equal(result.workspaces?.[0]?.name, 'Amina');
  assert.equal(result.workspaces?.[1]?.name, 'Amina Foods');
});

test('keeps user-created workspace records stable across migration reads', () => {
  const first = withWorkspaceDefaults(baseProfile());
  const second = withWorkspaceDefaults(first);
  assert.deepEqual(second.workspaces, first.workspaces);
  assert.deepEqual(second.workspaceMemberships, first.workspaceMemberships);
});
