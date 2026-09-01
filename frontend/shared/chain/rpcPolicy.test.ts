import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Sepolia and Polygon Amoy do not fall back to paid-plan dRPC endpoints', () => {
  const wagmi = readFileSync(new URL('../../core/wagmi.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(wagmi, /https:\/\/sepolia\.drpc\.org/);
  assert.doesNotMatch(wagmi, /https:\/\/polygon-amoy\.drpc\.org/);
  assert.match(wagmi, /https:\/\/ethereum-sepolia-rpc\.publicnode\.com/);
  assert.match(wagmi, /https:\/\/rpc-amoy\.polygon\.technology/);
});
