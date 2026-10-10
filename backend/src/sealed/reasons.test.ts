import assert from 'node:assert/strict';
import test from 'node:test';
import { reasonsFor, type SealedFacts } from './reasons.js';

const base: SealedFacts = { settled: 0, distinctCounterparties: 0, onTime: 0, withDeadline: 0, disputesLost: 0, personVerified: false };

test('no settled deals reads as new, without judgement', () => {
  assert.deepEqual(reasonsFor(base), ['NEW_ON_KARWAN']);
});

test('new and verified shows both', () => {
  assert.deepEqual(reasonsFor({ ...base, personVerified: true }), ['NEW_ON_KARWAN', 'HUMAN_VERIFIED']);
});

test('one to nine settled deals is has-completed; ten is many', () => {
  assert.deepEqual(reasonsFor({ ...base, settled: 1, disputesLost: 1 }), ['HAS_COMPLETED_DEALS']);
  assert.deepEqual(reasonsFor({ ...base, settled: 9, disputesLost: 1 }), ['HAS_COMPLETED_DEALS']);
  assert.equal(reasonsFor({ ...base, settled: 10, disputesLost: 1 })[0], 'MANY_COMPLETED_DEALS');
});

test('on time needs three timed deliveries and eighty percent', () => {
  const two = reasonsFor({ ...base, settled: 2, withDeadline: 2, onTime: 2, disputesLost: 1 });
  assert.ok(!two.includes('USUALLY_ON_TIME'));
  const fourOfFive = reasonsFor({ ...base, settled: 5, withDeadline: 5, onTime: 4, disputesLost: 1 });
  assert.ok(fourOfFive.includes('USUALLY_ON_TIME'));
  const threeOfFive = reasonsFor({ ...base, settled: 5, withDeadline: 5, onTime: 3, disputesLost: 1 });
  assert.ok(!threeOfFive.includes('USUALLY_ON_TIME'));
});

test('no lost disputes needs three settled deals and zero lost', () => {
  assert.ok(!reasonsFor({ ...base, settled: 2 }).includes('NO_LOST_DISPUTES'));
  assert.ok(reasonsFor({ ...base, settled: 3 }).includes('NO_LOST_DISPUTES'));
  assert.ok(!reasonsFor({ ...base, settled: 3, disputesLost: 1 }).includes('NO_LOST_DISPUTES'));
});

test('many clients at five distinct counterparties', () => {
  assert.ok(!reasonsFor({ ...base, settled: 4, distinctCounterparties: 4, disputesLost: 1 }).includes('WORKS_WITH_MANY'));
  assert.ok(reasonsFor({ ...base, settled: 5, distinctCounterparties: 5, disputesLost: 1 }).includes('WORKS_WITH_MANY'));
});

test('never more than three reasons, in priority order', () => {
  const all = reasonsFor({ settled: 12, distinctCounterparties: 8, onTime: 10, withDeadline: 10, disputesLost: 0, personVerified: true });
  assert.deepEqual(all, ['MANY_COMPLETED_DEALS', 'USUALLY_ON_TIME', 'NO_LOST_DISPUTES']);
});

test('a newcomer with a confirmed client and a registered business shows those, not only new', () => {
  assert.deepEqual(
    reasonsFor({ ...base, clientConfirmed: true, registeredBusiness: true, personVerified: true }),
    ['NEW_ON_KARWAN', 'WORK_CONFIRMED_BY_CLIENT', 'REGISTERED_BUSINESS'],
  );
});

test('public GitHub work shows when there is room', () => {
  assert.deepEqual(reasonsFor({ ...base, githubWork: true }), ['NEW_ON_KARWAN', 'OWNS_GITHUB_WORK']);
});

test('deal performance still comes before verification reasons', () => {
  const r = reasonsFor({ ...base, settled: 5, withDeadline: 5, onTime: 5, clientConfirmed: true });
  assert.deepEqual(r, ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME', 'NO_LOST_DISPUTES']);
});
