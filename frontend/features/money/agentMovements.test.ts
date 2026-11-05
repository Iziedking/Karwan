import assert from 'node:assert/strict';
import test from 'node:test';
import { isAgentMovement } from './agentMovements';

/// The Agents tab lists what the agents spent and received (view 51).
///
///   npx tsx --test features/money/agentMovements.test.ts

test('agent kinds count as agent movements', () => {
  for (const kind of ['agent_seed', 'agent_topup', 'agent_spend', 'gateway_fund_agent', 'agent_funding']) {
    assert.equal(isAgentMovement({ kind }), true, kind);
  }
});

test('a movement naming an agent counts, by its params or its words', () => {
  assert.equal(isAgentMovement({ kind: 'transfer_in', params: { agent: 'buyer' } }), true);
  assert.equal(isAgentMovement({ kind: 'transfer_in', summary: '1.276 USDC arrived in your buying agent' }), true);
  assert.equal(isAgentMovement({ kind: 'transfer_out', summary: '0.1 USDC left your selling agent' }), true);
});

test('money that only touched the balance does not count', () => {
  assert.equal(isAgentMovement({ kind: 'deposit', summary: 'Received 1 USDC from @madnade' }), false);
  assert.equal(isAgentMovement({ kind: 'transfer_out', summary: 'Paid @ada', params: null }), false);
});
