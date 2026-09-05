import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeInviteClaim,
  releaseInviteClaim,
  reserveInviteClaim,
} from './inviteClaim.ts';

test('only one concurrent claimant receives the reservation', () => {
  const first = reserveInviteClaim({}, '0xAAA', 1_000, 120_000);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = reserveInviteClaim(first.next, '0xBBB', 1_001, 120_000);
  assert.deepEqual(second, { ok: false, code: 'IN_PROGRESS' });

  const completed = completeInviteClaim(first.next, '0xAAA', 1_002);
  assert.equal(completed?.usedByAddress, '0xaaa');
  assert.equal(completed?.claimingByAddress, undefined);
  assert.deepEqual(reserveInviteClaim(completed ?? {}, '0xBBB', 1_003), {
    ok: false,
    code: 'CLAIMED',
  });
});

test('an expired reservation can be recovered by another claimant', () => {
  const first = reserveInviteClaim({}, '0xAAA', 1_000, 10);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const recovered = reserveInviteClaim(first.next, '0xBBB', 1_011, 10);
  assert.equal(recovered.ok, true);
  if (!recovered.ok) return;
  assert.equal(recovered.next.claimingByAddress, '0xbbb');
});

test('only the reservation owner can release it', () => {
  const first = reserveInviteClaim({}, '0xAAA', 1_000);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(releaseInviteClaim(first.next, '0xBBB'), null);
  assert.equal(releaseInviteClaim(first.next, '0xAAA')?.claimingByAddress, undefined);
});

test('the same claimant can recover an unexpired lease after interruption', () => {
  const first = reserveInviteClaim({}, '0xAAA', 1_000, 120_000);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.deepEqual(
    reserveInviteClaim(first.next, '0xaaa', 1_001, 120_000),
    { ok: true, next: first.next },
  );
});
