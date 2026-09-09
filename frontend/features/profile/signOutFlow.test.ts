import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmSignOut } from './signOutFlow';

test('confirmed sign-out returns to the signed-out app, not the marketing landing', async () => {
  const destinations: string[] = [];
  await confirmSignOut({
    confirm: async () => true,
    signOut: async () => {},
    leave: (destination) => { destinations.push(destination); },
  });
  assert.deepEqual(destinations, ['/app']);
});

test('cancelling sign out leaves the session and route untouched', async () => {
  const events: string[] = [];
  await confirmSignOut({ confirm: async () => false, signOut: async () => { events.push('logout'); }, leave: () => { events.push('leave'); } });
  assert.deepEqual(events, []);
});

test('navigation waits until confirmed session cleanup completes', async () => {
  const events: string[] = [];
  let finish: () => void = () => {};
  const cleanup = new Promise<void>((resolve) => { finish = resolve; });
  const run = confirmSignOut({ confirm: async () => true, signOut: async () => { events.push('logout'); await cleanup; events.push('clean'); }, leave: () => { events.push('leave'); } });
  await Promise.resolve();
  assert.deepEqual(events, ['logout']);
  finish();
  await run;
  assert.deepEqual(events, ['logout', 'clean', 'leave']);
});

test('a sign-out rejection stays on the current page for recovery', async () => {
  let left = false;
  await assert.rejects(confirmSignOut({ confirm: async () => true, signOut: async () => { throw new Error('failed'); }, leave: () => { left = true; } }), /failed/);
  assert.equal(left, false);
});
