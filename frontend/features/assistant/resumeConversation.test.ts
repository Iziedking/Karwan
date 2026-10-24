import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationToResume, NEW_CHAT } from './resumeConversation.js';

const list = [
  { id: 'old', updatedAt: 1 },
  { id: 'recent', updatedAt: 3 },
  { id: 'middle', updatedAt: 2 },
];

test('coming back opens the conversation you were in', () => {
  assert.equal(conversationToResume(list, 'middle'), 'middle');
});

test('without one on this device, the most recent opens', () => {
  assert.equal(conversationToResume(list, null), 'recent');
  assert.equal(conversationToResume(list, 'deleted'), 'recent');
});

test('a new chat you started stays new, and nothing saved opens nothing', () => {
  assert.equal(conversationToResume(list, NEW_CHAT), null);
  assert.equal(conversationToResume([], null), null);
});
