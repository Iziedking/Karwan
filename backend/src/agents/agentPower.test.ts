import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/// The agent switch (view 75).
///
///   node ../scripts/run-tests.mjs src/agents/agentPower.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-agent-power-')));
delete process.env.DATABASE_URL;

const { upsertProfile } = await import('../db/profiles.js');
const { AGENT_OFF_ANSWER, agentIsOn, agentOnOf, agentSwitchOpen } = await import('./agentPower.js');

test('an agent is on until its person switches it off', () => {
  assert.equal(agentOnOf(null), true);
  assert.equal(agentOnOf({}), true);
  assert.equal(agentOnOf({ agentPrefs: { agentMode: 'ask' } }), true);
  assert.equal(agentOnOf({ agentPrefs: { agentOn: true } }), true);
  assert.equal(agentOnOf({ agentPrefs: { agentOn: false } }), false);
});

test('the saved switch is read by address, and an unknown person counts as on', async () => {
  const OFF = '0x00000000000000000000000000000000000000e1';
  const ON = '0x00000000000000000000000000000000000000e2';
  await upsertProfile({ address: OFF, role: 'seller', displayName: 'Efe', agentPrefs: { agentOn: false } } as never);
  await upsertProfile({ address: ON, role: 'seller', displayName: 'Ola' } as never);
  assert.equal(await agentIsOn(OFF), false);
  assert.equal(await agentIsOn(OFF.toUpperCase().replace('0X', '0x')), false);
  assert.equal(await agentIsOn(ON), true);
  assert.equal(await agentIsOn('0x00000000000000000000000000000000000000e3'), true);
});

test('a tool the agent does says it is off and how to turn it on', () => {
  assert.equal(AGENT_OFF_ANSWER.agentOff, true);
  assert.match(AGENT_OFF_ANSWER.next, /switched off/);
  assert.match(AGENT_OFF_ANSWER.next, /part power, on true/);
});

test('the switch is open only where the seller is asked and the buyer picks from a shortlist', () => {
  assert.equal(agentSwitchOpen({ sellerAsked: true, shortlist: true }), true);
  assert.equal(agentSwitchOpen({ sellerAsked: true, shortlist: false }), false);
  assert.equal(agentSwitchOpen({ sellerAsked: false, shortlist: true }), false);
  assert.equal(agentSwitchOpen({ sellerAsked: false, shortlist: false }), false);
});
