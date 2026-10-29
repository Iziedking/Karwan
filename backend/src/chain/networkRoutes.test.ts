import assert from 'node:assert/strict';
import test from 'node:test';
import { DEAL_ROUTE_PREFIXES, closedPrefixes } from './networkRoutes.js';

test('with the full contract set, nothing is closed', () => {
  assert.deepEqual(closedPrefixes({ legacyDeployed: true, v3EscrowDeployed: true }), []);
  assert.deepEqual(closedPrefixes({ legacyDeployed: true, v3EscrowDeployed: false }), []);
});

test('with no contracts, every deal route is closed', () => {
  assert.deepEqual(closedPrefixes({ legacyDeployed: false, v3EscrowDeployed: false }), DEAL_ROUTE_PREFIXES);
});

test('with only the v3 escrow, direct deals and offers open and everything else stays closed', () => {
  const closed = closedPrefixes({ legacyDeployed: false, v3EscrowDeployed: true });
  assert.ok(!closed.includes('/api/deals'));
  assert.ok(!closed.includes('/api/listings'));
  for (const p of ['/api/jobs', '/api/agents', '/api/reputation', '/api/x402', '/api/vault', '/api/guarantee', '/api/factoring']) {
    assert.ok(closed.includes(p), p);
  }
});
