import assert from 'node:assert/strict';
import test from 'node:test';
import { passkeyName } from './passkeyName';

test('a new passkey is named after the email and never repeats a name Circle already holds', () => {
  const names = new Set(Array.from({ length: 200 }, () => passkeyName('Sam@Example.com ')));
  assert.equal(names.size, 200);
  for (const name of names) assert.match(name, /^sam@example\.com \([a-z0-9]{5}\)$/);
});
