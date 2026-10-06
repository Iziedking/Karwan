import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceRows } from './sourceRows';

const chains = ['sepolia', 'baseSepolia', 'polygonAmoy'] as const;

test('Arc leads, chains holding USDC follow by amount, empty ones fold away', () => {
  const rows = sourceRows({ connected: true, arc: 435.13, chains: [...chains], amounts: { baseSepolia: 3, polygonAmoy: 40 } });
  assert.deepEqual(rows.listed.map((r) => [r.key, r.amount]), [['arc', 435.13], ['polygonAmoy', 40], ['baseSepolia', 3]]);
  assert.deepEqual(rows.empty.map((r) => r.key), ['sepolia']);
});

test('Arc stays first even when empty', () => {
  const rows = sourceRows({ connected: true, arc: 0, chains: [...chains], amounts: { sepolia: 5 } });
  assert.equal(rows.listed[0]!.key, 'arc');
});

test('before a wallet connects, Arc shows and the rest wait behind Show without amounts', () => {
  const rows = sourceRows({ connected: false, arc: null, chains: [...chains], amounts: {} });
  assert.deepEqual(rows.listed.map((r) => [r.key, r.amount]), [['arc', null]]);
  assert.deepEqual(rows.empty.map((r) => [r.key, r.amount]), [['sepolia', null], ['baseSepolia', null], ['polygonAmoy', null]]);
});
