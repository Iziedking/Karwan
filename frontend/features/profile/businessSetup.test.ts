import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { UserProfile } from '@/core/api';
import { businessSetupInput } from './businessSetup';

const personal: UserProfile = {
  address: '0x123', role: 'buyer', displayName: 'Alex', accountKind: 'person',
  createdAt: 1, updatedAt: 2,
  buyer: { maxBudgetUsdc: 250, minDeadlineDays: 2, maxDeadlineDays: 30, milestonePcts: [25, 75] },
};

test('requires explicit confirmation before converting a personal profile', () => {
  assert.throws(() => businessSetupInput(personal, 'Acme', false), /confirmation_required/);
});

test('preserves roles, trading limits and milestones without activating anything', () => {
  const before = structuredClone(personal);
  const input = businessSetupInput(personal, ' Acme ', true);
  assert.deepEqual(input, {
    address: personal.address, role: 'buyer', displayName: 'Acme', accountKind: 'business', buyer: personal.buyer,
  });
  assert.deepEqual(personal, before);
  assert.equal('seller' in input, false);
});

test('keeps business seller details and does not require a second conversion', () => {
  const business: UserProfile = { ...personal, accountKind: 'business', role: 'both',
    seller: { skills: ['Logistics'], tradeType: 'services', bio: 'Freight', minBudgetUsdc: 50, maxBudgetUsdc: 900, minDeadlineDays: 1, maxDeadlineDays: 20 },
  };
  assert.deepEqual(businessSetupInput(business, 'Acme', false).seller, business.seller);
});

test('rejects empty and oversized names', () => {
  assert.throws(() => businessSetupInput(personal, '   ', true), /invalid_name/);
  assert.throws(() => businessSetupInput(personal, 'a'.repeat(41), true), /invalid_name/);
});

test('the profile business entry opens its own page, not first-time onboarding', () => {
  const hub = readFileSync(new URL('./components/ProfileAccountHub.tsx', import.meta.url), 'utf8');
  assert.match(hub, /href="\/profile\/business"/);
  assert.doesNotMatch(hub, /href=\{business \? '\/business\/verification' : '\/onboarding'\}/);
});
