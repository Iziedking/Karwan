import assert from 'node:assert/strict';
import test from 'node:test';
import { startAgents, type AgentStartDeps } from './agentStart.js';

/// A new account's agents are set up in the background: sign-up never waits
/// and never fails because of it.
///
///   npx tsx --test src/profile/agentStart.test.ts

const tick = () => new Promise((r) => setImmediate(r));

function deps(over: Partial<AgentStartDeps> = {}) {
  const calls = { activate: 0, logged: [] as string[] };
  const d: AgentStartDeps = {
    existing: async () => null,
    activate: async () => { calls.activate += 1; },
    log: (err) => { calls.logged.push(err.message); },
    ...over,
  };
  return { d, calls };
}

test('a new account gets its agents set up once', async () => {
  const { d, calls } = deps();
  startAgents('0xAda', d);
  await tick();
  assert.equal(calls.activate, 1);
  assert.deepEqual(calls.logged, []);
});

test('an account that already has agents is left alone', async () => {
  const { d, calls } = deps({ existing: async () => ({}) });
  startAgents('0xada', d);
  await tick();
  assert.equal(calls.activate, 0);
});

test('a failed setup is logged and never thrown', async () => {
  const { d, calls } = deps({ activate: async () => { throw new Error('circle timed out'); } });
  assert.doesNotThrow(() => startAgents('0xada', d));
  await tick();
  await tick();
  assert.deepEqual(calls.logged, ['circle timed out']);
});

test('the address is passed lowercased', async () => {
  let seen = '';
  const { d } = deps({ activate: async (a) => { seen = a; } });
  startAgents('0xABC', d);
  await tick();
  assert.equal(seen, '0xabc');
});
