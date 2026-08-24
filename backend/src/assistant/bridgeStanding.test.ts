import assert from 'node:assert/strict';
import test from 'node:test';
import { bridgeStanding, needsTheUser, UNSIGNED_GRACE_MS } from './bridgeStanding.js';

const NOW = 1_760_000_000_000;
const HASH = '0xabc';

test('a transfer declined at the wallet is not in flight', () => {
  // The reported bug. Declining the wallet prompt leaves the record at
  // `approving`: nothing errored on the server, so it never becomes `error`,
  // and the assistant kept calling it in flight and saying "track it" about a
  // transfer that was never signed.
  const standing = bridgeStanding({
    status: 'approving',
    updatedAt: NOW - UNSIGNED_GRACE_MS,
    now: NOW,
  });
  assert.deepEqual(standing, { kind: 'unsigned' });
  assert.equal(needsTheUser(standing), true);
});

test('a prompt that may still be open is left alone', () => {
  // Someone reading a wallet prompt has not abandoned it. Calling this
  // unsigned would nag a user mid-signature.
  assert.deepEqual(
    bridgeStanding({ status: 'approving', updatedAt: NOW - 10_000, now: NOW }),
    { kind: 'moving' },
  );
});

test('a burn on chain is in flight whatever the status says', () => {
  // The status is a projection and can lag; the burn is the fact.
  for (const status of ['approving', 'burning', 'relaying'] as const) {
    assert.deepEqual(
      bridgeStanding({ status, sourceTxHash: HASH, updatedAt: NOW - 86_400_000, now: NOW }),
      { kind: 'moving' },
      status,
    );
  }
});

test('a failure is reported, and which side of the burn it fell on', () => {
  // Failures used to be skipped outright, so a user asking about their money
  // heard nothing about the one that did not go through. The two are not the
  // same news: before the burn nothing left, after it money is missing.
  const before = bridgeStanding({ status: 'error', now: NOW });
  assert.deepEqual(before, { kind: 'failed_before_burn' });
  const after = bridgeStanding({ status: 'error', sourceTxHash: HASH, now: NOW });
  assert.deepEqual(after, { kind: 'failed_after_burn' });
  assert.equal(needsTheUser(before), true);
  assert.equal(needsTheUser(after), true);
});

test('a settled transfer is not worth a line', () => {
  const standing = bridgeStanding({ status: 'minted', sourceTxHash: HASH, now: NOW });
  assert.deepEqual(standing, { kind: 'settled' });
  assert.equal(needsTheUser(standing), false);
});

test('a missing timestamp does not invent abandonment', () => {
  // An old record with no updatedAt must not read as declined.
  assert.deepEqual(bridgeStanding({ status: 'approving', now: NOW }), { kind: 'moving' });
});
