import assert from 'node:assert/strict';
import test from 'node:test';
import { failuresSince, getBackup, liveRequest, markRegistered, openRequest, recordAttempt, saveBackup, setRequestState } from './recovery.js';
import { RECOVERY_WAIT_MS } from '../recovery/rules.js';

const W = '0x3333333333333333333333333333333333333333';
const backup = {
  walletAddress: W,
  emailHash: 'h',
  recoveryAddress: '0x4444444444444444444444444444444444444444',
  kdf: { alg: 'argon2id' as const, m: 65536, t: 3, p: 1, salt: 'c2FsdA' },
  iv: 'aXY',
  sealedBlob: new Uint8Array([1, 2]),
  sealedVerifier: new Uint8Array([3]),
  createdAt: 1,
  registeredAt: null,
};

test('one backup per wallet; a second save does not overwrite it', async () => {
  assert.equal(await saveBackup(backup), 'created');
  assert.equal(await saveBackup({ ...backup, iv: 'other' }), 'exists');
  assert.equal((await getBackup(W))!.iv, 'aXY');
  await markRegistered(W, 99);
  await markRegistered(W, 150);
  assert.equal((await getBackup(W))!.registeredAt, 99);
});

test('starting twice returns the same waiting request and keeps the clock', async () => {
  const first = await openRequest(W, 1000);
  assert.equal(first.created, true);
  assert.equal(first.request.releasableAt, 1000 + RECOVERY_WAIT_MS);
  const again = await openRequest(W, 5000);
  assert.equal(again.created, false);
  assert.equal(again.request.id, first.request.id);
  assert.equal(again.request.releasableAt, 1000 + RECOVERY_WAIT_MS);
  await setRequestState(first.request.id, { state: 'cancelled', cancelledAt: 6000 });
  assert.equal(await liveRequest(W), null);
  assert.equal((await openRequest(W, 7000)).created, true);
});

test('failures are counted per wallet', async () => {
  await recordAttempt(W, 10, false);
  await recordAttempt(W, 20, true);
  await recordAttempt('0x5555555555555555555555555555555555555555', 30, false);
  assert.deepEqual(await failuresSince(W, 0), [10]);
});
