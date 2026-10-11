import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isSolanaGasShortfall } from './solanaGas';

test('a Solana error that names SOL is a gas shortfall even without the word insufficient', () => {
  assert.equal(isSolanaGasShortfall('Transaction simulation failed: not enough SOL to pay fees'), true);
  assert.equal(isSolanaGasShortfall('insufficient funds for rent'), true);
});

test('an unrelated failure, or SOL inside another word, is not', () => {
  assert.equal(isSolanaGasShortfall('attestation timed out'), false);
  assert.equal(isSolanaGasShortfall('console error'), false);
});

test('the bridge hook uses the shared check and carries no control characters', () => {
  const src = readFileSync(new URL('./hooks/useBridge.ts', import.meta.url), 'utf8');
  assert.match(src, /isSolanaGasShortfall\(raw\)/);
  assert.equal(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(src), false);
});
