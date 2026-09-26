import assert from 'node:assert/strict';
import test from 'node:test';
import { localTagIssue, normalizeTag } from './tag';

test('normalizes like the server: trimmed, lowercase, no leading @', () => {
  assert.equal(normalizeTag('  @Ada_Lovelace '), 'ada_lovelace');
});

test('flags shape problems before asking the server', () => {
  assert.equal(localTagIssue(''), null);
  assert.equal(localTagIssue('ab'), 'too_short');
  assert.equal(localTagIssue('a'.repeat(21)), 'too_long');
  assert.equal(localTagIssue('9lives'), 'invalid');
  assert.equal(localTagIssue('john.doe'), 'invalid');
  assert.equal(localTagIssue('bad__name'), 'invalid');
  assert.equal(localTagIssue('ada'), null);
  assert.equal(localTagIssue('ada_2'), null);
});
