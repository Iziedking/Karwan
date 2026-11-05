import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proofRules } from './requirementCheck.js';

test('a safe link that opened is received, never called a match', () => {
  assert.deepEqual(proofRules({ deliveryProof: 'https://t.mercor.com/tGbfB', linkSafety: 'clean' }), { verdict: 'received', reason: '' });
});

test('a written delivery with no link is received', () => {
  assert.equal(proofRules({ deliveryProof: 'Three classes held on Monday, Wednesday and Friday.', linkSafety: undefined }).verdict, 'received');
});

test('a link that was held or could not be opened leaves the verdict to a person', () => {
  for (const linkSafety of ['suspicious', 'malicious', 'unverifiable', undefined] as const) {
    assert.equal(proofRules({ deliveryProof: 'See https://example.com/work', linkSafety }).verdict, 'unknown', String(linkSafety));
  }
});

test('an empty proof gives no verdict', () => {
  assert.equal(proofRules({ deliveryProof: '  ', linkSafety: 'clean' }).verdict, 'unknown');
});
