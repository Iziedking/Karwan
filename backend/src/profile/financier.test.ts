import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deskStake } from './financier.js';

const g = (inPlaceUsdc: number, heldUsdc = 0) => ({ inPlaceUsdc, heldUsdc, sinceSecs: null });

test('a Deal guarantee counts on the finance desk, not only the previous vault', () => {
  assert.deepEqual(deskStake(0, g(170)), { stakeUsdc: 170, stakeRead: true });
  assert.deepEqual(deskStake(25, g(170, 20)), { stakeUsdc: 175, stakeRead: true });
});

test('a held guarantee never counts below zero', () => {
  assert.equal(deskStake(null, g(10, 40)).stakeUsdc, 0);
});

test('one source failing still counts the other, both failing is unread', () => {
  assert.deepEqual(deskStake(null, g(170)), { stakeUsdc: 170, stakeRead: true });
  assert.deepEqual(deskStake(30, 'failed'), { stakeUsdc: 30, stakeRead: true });
  assert.deepEqual(deskStake(null, 'failed'), { stakeUsdc: 0, stakeRead: false });
  assert.deepEqual(deskStake(null, null), { stakeUsdc: 0, stakeRead: true });
});
