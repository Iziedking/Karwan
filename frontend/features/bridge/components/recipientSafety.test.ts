import assert from 'node:assert/strict';
import test from 'node:test';
import { isTrustedRecipient } from './recipientSafety';

test('matches a known Karwan wallet case-insensitively', () => {
  assert.equal(isTrustedRecipient('0xABCDEF', ['0xabcdef']), true);
});

test('does not trust an unrelated contract address', () => {
  assert.equal(isTrustedRecipient('0xabc123', ['0xdef456']), false);
});
