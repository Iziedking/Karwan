import assert from 'node:assert/strict';
import test from 'node:test';
import { aloneOf, modeOf, switchesOf, type AgentMode } from './alone.js';

const profile = (agentPrefs: Record<string, unknown>) => ({ agentPrefs }) as never;
const NONE = { offers: false, bargain: false, agree: false, lock: false, find: false, data: false, brief: false };

test('each old mode reads as before', () => {
  assert.deepEqual(aloneOf(profile({ agentMode: 'offers' })), { offers: true, bargain: true, agree: false, lock: false, find: true, data: true, brief: true });
  assert.deepEqual(aloneOf(profile({ agentMode: 'agree' })), { offers: true, bargain: true, agree: true, lock: false, find: true, data: true, brief: true });
  assert.deepEqual(aloneOf(profile({ agentMode: 'ask' })), { offers: false, bargain: false, agree: false, lock: false, find: true, data: false, brief: true });
});

test('a profile with nothing saved is on Make offers', () => {
  assert.deepEqual(aloneOf(null), aloneOf(profile({ agentMode: 'offers' })));
  assert.deepEqual(aloneOf(profile({})), aloneOf(profile({ agentMode: 'offers' })));
});

test('lock is off unless it was saved on', () => {
  for (const agentMode of ['offers', 'ask', 'agree']) assert.equal(aloneOf(profile({ agentMode })).lock, false);
  assert.equal(aloneOf(profile({ agentMode: 'agree', alone: { lock: true } })).lock, true);
});

test('a saved switch wins over the mode, and only that switch', () => {
  const alone = aloneOf(profile({ agentMode: 'offers', alone: { bargain: false } }));
  assert.deepEqual(alone, { offers: true, bargain: false, agree: false, lock: false, find: true, data: true, brief: true });
  assert.equal(aloneOf(profile({ agentMode: 'ask', alone: { data: true } })).data, true);
  assert.equal(aloneOf(profile({ agentMode: 'offers', alone: { find: false } })).find, false);
});

test('a saved value that is not a yes or no is ignored', () => {
  assert.equal(aloneOf(profile({ agentMode: 'offers', alone: { offers: 'no', lock: 1 } })).offers, true);
  assert.equal(aloneOf(profile({ agentMode: 'offers', alone: { offers: 'no', lock: 1 } })).lock, false);
});

test('with the agent off every switch reads as off, and the saved ones are kept', () => {
  const p = profile({ agentMode: 'agree', agentOn: false, alone: { lock: true } });
  assert.deepEqual(aloneOf(p), NONE);
  assert.equal(switchesOf(p).agree, true);
  assert.equal(switchesOf(p).lock, true);
});

test('an agent that stopped itself reads as all off', () => {
  const p = profile({ agentMode: 'agree', alone: { lock: true } });
  assert.deepEqual(aloneOf(p, { stopped: { at: 1, reason: 'lock-failures' } }), NONE);
  assert.equal(aloneOf(p, {}).lock, true);
});

test('the brief follows the agent record, never a saved switch', () => {
  assert.equal(aloneOf(profile({}), { brief: { on: false, hour: 8, timeZone: 'Africa/Lagos' } }).brief, false);
  assert.equal(aloneOf(profile({}), { brief: { on: true, hour: 8, timeZone: 'Africa/Lagos' } }).brief, true);
  assert.equal(aloneOf(profile({}), null).brief, true);
  assert.equal(aloneOf(profile({ alone: { brief: false } })).brief, true);
});

test('the mode read back from the switches is the mode that was saved', () => {
  for (const agentMode of ['offers', 'ask', 'agree'] as AgentMode[]) {
    assert.equal(modeOf(switchesOf(profile({ agentMode }))), agentMode);
  }
  assert.equal(modeOf({ offers: false, agree: true }), 'agree');
});
