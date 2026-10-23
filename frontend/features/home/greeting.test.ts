import assert from 'node:assert/strict';
import test from 'node:test';
import { greetingsCopy } from '@/shared/i18n/messages/greetings';
import { greetingFor } from './greetingTime';

test('Home greets by the hour of the day', () => {
  assert.equal(greetingFor(0), 'morning');
  assert.equal(greetingFor(11), 'morning');
  assert.equal(greetingFor(12), 'afternoon');
  assert.equal(greetingFor(16), 'afternoon');
  assert.equal(greetingFor(17), 'evening');
  assert.equal(greetingFor(23), 'evening');
});

test('every language has every greeting', () => {
  for (const copy of Object.values(greetingsCopy)) {
    for (const part of ['morning', 'afternoon', 'evening'] as const) assert.ok(copy[part].trim().length > 0);
  }
});
