import assert from 'node:assert/strict';
import test from 'node:test';
import { passkeyName } from './passkeyName';

// Circle's rule for a passkey name: 5 to 50 characters, letters, digits and _@.:+- only.
const CIRCLE_RULE = /^[A-Za-z0-9_@.:+-]{5,50}$/;

test('a new passkey is named after the email and never repeats a name Circle already holds', () => {
  const names = new Set(Array.from({ length: 200 }, () => passkeyName('Sam@Example.com ')));
  assert.equal(names.size, 200);
  for (const name of names) assert.match(name, /^sam@example\.com:[a-z0-9]{5}$/);
});

test('every name passes Circle\'s rule, however long or unusual the email', () => {
  for (const email of ['a@b.co', "o'brien%x!@mail.com", `${'x'.repeat(60)}@example.com`, 'ünï@exámple.com']) {
    assert.match(passkeyName(email), CIRCLE_RULE, email);
  }
});
