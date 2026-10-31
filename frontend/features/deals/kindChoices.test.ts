import assert from 'node:assert/strict';
import test from 'node:test';
import { kindChoices, preselectedKind } from './kindChoices';

/// How do you want to pay? Only what runs today (view 44, section 6).
///
///   npx tsx --test features/deals/kindChoices.test.ts

test('the picker lists work and goods, and hourly only when it runs', () => {
  assert.deepEqual(kindChoices({ hourlyWork: false }), { work: ['one', 'stages', 'contest'], goods: ['shipped', 'in_person'] });
  assert.deepEqual(kindChoices({ hourlyWork: true }), { work: ['one', 'stages', 'hourly', 'monthly', 'contest'], goods: ['shipped', 'in_person'] });
});

test('a deal opened from a listing or a link starts on the right kind', () => {
  assert.equal(preselectedKind({ kind: 'stages' }), 'stages');
  assert.equal(preselectedKind({ kind: 'in_person' }), 'in_person');
  assert.equal(preselectedKind({ kind: 'nonsense' }), null);
  assert.equal(preselectedKind({ listingKind: 'goods' }), 'shipped');
  assert.equal(preselectedKind({ listingKind: 'in_person' }), 'one');
  assert.equal(preselectedKind({ listingKind: 'remote' }), 'one');
  assert.equal(preselectedKind({}), null);
});
