import assert from 'node:assert/strict';
import test from 'node:test';
import { trustCard, trustFacts, type TrustDeal } from './trustCard.js';

const SELLER = '0x2222222222222222222222222222222222222222';
const deal = (patch: Partial<TrustDeal>): TrustDeal => ({
  buyer: '0x1111111111111111111111111111111111111111',
  seller: SELLER,
  settledAt: 1,
  deliveredAt: 100,
  deadlineUnix: 1,
  ...patch,
});

test('facts count settled deals, distinct counterparties, on-time and disputes', () => {
  const deals = [
    deal({ buyer: '0xaaaa000000000000000000000000000000000001', deliveredAt: 5000, deadlineUnix: 1 }),
    deal({ buyer: '0xaaaa000000000000000000000000000000000001', deliveredAt: 500, deadlineUnix: 10 }),
    deal({ buyer: '0xaaaa000000000000000000000000000000000002', deliveredAt: 500, deadlineUnix: 10, disputed: true }),
    deal({ buyer: '0xaaaa000000000000000000000000000000000003', settledAt: undefined, cancelledAt: 5 }),
    deal({ seller: '0x9999999999999999999999999999999999999999' }),
  ];
  assert.deepEqual(trustFacts(deals, SELLER, 'seller'), {
    settled: 3,
    distinctCounterparties: 2,
    onTime: 2,
    withDeadline: 3,
    disputes: 1,
  });
});

test('as buyer, on-time is not a measure', () => {
  const facts = trustFacts([deal({ buyer: SELLER, seller: '0x3333333333333333333333333333333333333333' })], SELLER, 'buyer');
  assert.equal(facts.settled, 1);
  assert.equal(facts.withDeadline, 0);
});

test('a verified business shows its registered name; otherwise the display name', () => {
  const facts = { settled: 2, distinctCounterparties: 2, onTime: 2, withDeadline: 2, disputes: 0 };
  const business = trustCard({
    role: 'seller', facts, memberSince: 10, displayName: 'amina', companyName: 'Amina Foods Ltd',
    businessVerified: true, personVerified: false, xProven: true, stakeUsdc: null,
  });
  assert.equal(business.name, 'Amina Foods Ltd');
  assert.equal(business.verifiedBusiness, true);
  assert.deepEqual(business.provenAccounts, ['x']);
  assert.equal(business.isNew, false);
  const person = trustCard({
    role: 'seller', facts, memberSince: 10, displayName: 'amina', companyName: 'Amina Foods Ltd',
    businessVerified: false, personVerified: true, xProven: false, stakeUsdc: '600',
  });
  assert.equal(person.name, 'amina');
  assert.equal(person.verifiedBusiness, false);
  assert.equal(person.verifiedPerson, true);
  assert.equal(person.stakeUsdc, '600');
  assert.deepEqual(person.provenAccounts, []);
});

test('an account with no settled deals is new, never flagged', () => {
  const card = trustCard({
    role: 'buyer', facts: { settled: 0, distinctCounterparties: 0, onTime: 0, withDeadline: 0, disputes: 0 },
    memberSince: null, displayName: null, companyName: null, businessVerified: false, personVerified: false,
    xProven: false, stakeUsdc: null,
  });
  assert.equal(card.isNew, true);
  assert.equal(card.name, null);
});

test('the card is an allowlist: no address or raw profile ever leaves', () => {
  const card = trustCard({
    role: 'seller', facts: { settled: 1, distinctCounterparties: 1, onTime: 1, withDeadline: 1, disputes: 0 },
    memberSince: 10, displayName: 'amina', companyName: null, businessVerified: false, personVerified: false,
    xProven: false, stakeUsdc: null,
  });
  assert.deepEqual(Object.keys(card).sort(), [
    'facts', 'isNew', 'memberSince', 'name', 'provenAccounts', 'role', 'stakeUsdc', 'verifiedBusiness', 'verifiedPerson',
  ]);
});

test('a disputed deal delivered before deadline still counts as on-time', () => {
  const facts = trustFacts([
    deal({ buyer: '0xaaaa000000000000000000000000000000000001', deliveredAt: 500, deadlineUnix: 10, disputed: true }),
  ], SELLER, 'seller');
  assert.equal(facts.onTime, 1);
  assert.equal(facts.disputes, 1);
});
