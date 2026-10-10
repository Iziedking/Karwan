import assert from 'node:assert/strict';
import test from 'node:test';
import { chatAccountEmail, deliverableRecipients, isChatAccountEmail } from './chatRecipients.js';

test('a chat account email is on the reserved .invalid domain and recognised', () => {
  const e = chatAccountEmail('ab12cd34ef56');
  assert.match(e, /@whatsapp\.invalid$/);
  assert.equal(isChatAccountEmail(e), true);
  assert.equal(isChatAccountEmail('ada@example.com'), false);
});

test('chat account recipients are dropped, real ones kept', () => {
  assert.deepEqual(deliverableRecipients(['ada@example.com', chatAccountEmail('x')]), ['ada@example.com']);
  assert.deepEqual(deliverableRecipients(chatAccountEmail('x')), []);
  assert.deepEqual(deliverableRecipients('tunde@example.com'), ['tunde@example.com']);
});
