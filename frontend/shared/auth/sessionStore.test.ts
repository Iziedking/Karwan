import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAuthSessionSnapshot,
  loadAuthSessionOnce,
  publishAuthSession,
  resetAuthSessionStoreForTests,
  subscribeAuthSession,
} from './sessionStore.js';

test('publishes one authenticated snapshot to every consumer', () => {
  resetAuthSessionStoreForTests();
  let notifications = 0;
  const unsubscribeA = subscribeAuthSession(() => notifications++);
  const unsubscribeB = subscribeAuthSession(() => notifications++);

  publishAuthSession({
    address: '0x1111111111111111111111111111111111111111',
    method: 'circle',
    email: 'buyer@example.com',
    hasPasskey: true,
  });

  assert.equal(notifications, 2);
  assert.equal(getAuthSessionSnapshot().loaded, true);
  assert.equal(getAuthSessionSnapshot().session?.method, 'circle');
  unsubscribeA();
  unsubscribeB();
});

test('deduplicates concurrent session requests', async () => {
  resetAuthSessionStoreForTests();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const loader = async () => {
    calls++;
    await gate;
    return { session: null };
  };

  const first = loadAuthSessionOnce(loader);
  const second = loadAuthSessionOnce(loader);
  assert.equal(first, second);
  assert.equal(calls, 1);
  release();
  await first;
});
