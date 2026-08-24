import assert from 'node:assert/strict';
import test from 'node:test';
import { bindingStateFor, stakeResolvesForAgent } from './agentBinding.js';

const AGENT = '0x9EC5000000000000000000000000000000008A39';
const IDENTITY = '0x7711886865c33606ebd977da02a6a25373c75a35';
const SOMEONE_ELSE = '0x1111111111111111111111111111111111111111';

test('an agent the vault resolves to itself is unbound', () => {
  // The live case: approveAgent was never called, so registerOwner always
  // reverted AgentNotApproved and agentOwner stayed zero. freeStakeOf then reads
  // the agent's own balance, which is nothing, and acceptEscrow reverts with the
  // identity's stake sitting one resolution away.
  const state = bindingStateFor({ agent: AGENT, resolvedOwner: AGENT, identity: IDENTITY });
  assert.deepEqual(state, { kind: 'unbound' });
  assert.equal(stakeResolvesForAgent(state), false);
});

test('an agent resolving to its identity is bound, whatever the case', () => {
  const state = bindingStateFor({
    agent: AGENT.toLowerCase(),
    resolvedOwner: IDENTITY.toUpperCase(),
    identity: IDENTITY,
  });
  assert.deepEqual(state, { kind: 'bound', owner: IDENTITY.toLowerCase() });
  assert.equal(stakeResolvesForAgent(state), true);
});

test('an agent bound to someone else is not reported as merely missing', () => {
  // registerOwner refuses to move a binding (AgentOwnerAlreadySet), so telling
  // this user to sign again would send them at a transaction that cannot
  // succeed. It is a different problem and has to read as one.
  const state = bindingStateFor({
    agent: AGENT,
    resolvedOwner: SOMEONE_ELSE,
    identity: IDENTITY,
  });
  assert.deepEqual(state, { kind: 'foreign', owner: SOMEONE_ELSE });
  assert.equal(stakeResolvesForAgent(state), false);
});

test('a missing read is unbound, never bound', () => {
  // A failed or empty resolveOwner must not read as "stake resolves": the cost
  // of a false positive is a deal that fails at activation.
  for (const resolved of ['', '   ']) {
    assert.deepEqual(
      bindingStateFor({ agent: AGENT, resolvedOwner: resolved, identity: IDENTITY }),
      { kind: 'unbound' },
    );
  }
  assert.deepEqual(
    bindingStateFor({ agent: '', resolvedOwner: IDENTITY, identity: IDENTITY }),
    { kind: 'unbound' },
  );
});
