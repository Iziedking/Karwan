import assert from 'node:assert/strict';
import test from 'node:test';
import { directMessagesCopy } from '../../shared/i18n/messages/directMessages';
import { refusalText } from './refusal';

/// A refused send says why, in the reader's language, never a bare "try again".
///
///   npx tsx --test features/messages/refusal.test.ts

const t = directMessagesCopy.en;
const HOUR = 60 * 60 * 1000;

test('a paused sender is told when they can write to someone new', () => {
  assert.equal(refusalText({ code: 'paused', until: 3 * HOUR + 1 }, 0, '@bo', t), 'You can write to someone new in about 4 hours.');
});

test('each refusal has its own words', () => {
  assert.equal(refusalText({ code: 'wait_reply' }, 0, '@bo', t), 'Wait for @bo to reply before you write again.');
  assert.equal(refusalText({ code: 'no_tag' }, 0, '@bo', t), 'Pick a Karwan tag first so they can answer you.');
  assert.equal(refusalText({ code: 'link_blocked' }, 0, '@bo', t), 'Karwan flagged a link in this message and will not send it.');
  assert.equal(refusalText({}, 0, '@bo', t), 'Not sent. Try again.');
});
