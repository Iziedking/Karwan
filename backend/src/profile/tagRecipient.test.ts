import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagRecipient } from './tagRecipient.js';

const ada = { address: '0x00000000000000000000000000000000000000aa', displayName: 'Ada Obi', handle: 'ada' };
const me = '0x00000000000000000000000000000000000000Bb';

test('a tag with no account is not found', () => {
  assert.deepEqual(tagRecipient('ada', null, me), { found: false, tag: 'ada' });
});

test('a found tag names the person and the address to pay', () => {
  assert.deepEqual(tagRecipient('@Ada', ada, me), {
    found: true,
    self: false,
    tag: 'ada',
    displayName: 'Ada Obi',
    address: '0x00000000000000000000000000000000000000aa',
  });
});

test('your own tag is marked so the sheet can refuse it', () => {
  const result = tagRecipient('ada', ada, '0x00000000000000000000000000000000000000AA');
  assert.equal(result.found && result.self, true);
});

test('a profile without a display name falls back to the tag', () => {
  const result = tagRecipient('ada', { ...ada, displayName: '  ' }, me);
  assert.equal(result.found && result.displayName, '@ada');
});

test('a malformed address on the profile is never offered as a destination', () => {
  assert.deepEqual(tagRecipient('ada', { ...ada, address: 'not-an-address' }, me), { found: false, tag: 'ada' });
});
