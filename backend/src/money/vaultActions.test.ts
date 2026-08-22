import test from 'node:test';
import assert from 'node:assert/strict';
import { vaultActionOperationKey } from './vaultActions.js';

test('vault action keys are idempotent per owner, action, position, and request', () => {
  assert.equal(
    vaultActionOperationKey('0xABC', 'claim', '7', 'req-1'),
    'vault:claim:0xabc:7:req-1',
  );
  assert.notEqual(
    vaultActionOperationKey('0xABC', 'claim', '7', 'req-1'),
    vaultActionOperationKey('0xABC', 'claim', '7', 'req-2'),
  );
});
