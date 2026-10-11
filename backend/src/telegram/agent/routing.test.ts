import assert from 'node:assert/strict';
import test from 'node:test';
import { isAgentUpdate, startPayload, textGoesToAgent } from './routing.js';

test('a start payload is a wallet link token or a client confirmation', () => {
  assert.deepEqual(startPayload('/start abc123'), { kind: 'link', token: 'abc123' });
  assert.deepEqual(startPayload('/start cw_req-9'), { kind: 'clientConfirm', requestId: 'req-9' });
  assert.equal(startPayload('/start'), null);
  assert.equal(startPayload('hello'), null);
});

test('free text reaches the agent only in a private chat with no open support ticket', () => {
  assert.equal(textGoesToAgent({ chatType: 'private', ticketOpen: false }), true);
  assert.equal(textGoesToAgent({ chatType: 'private', ticketOpen: true }), false);
  assert.equal(textGoesToAgent({ chatType: 'group', ticketOpen: false }), false);
});

test('taps and files in a private chat are the agent’s; group noise is not', () => {
  const chat = { id: 1, type: 'private' };
  const from = { id: 2 };
  assert.equal(isAgentUpdate({ update_id: 1, callback_query: { id: 'c', from, message: { message_id: 1, chat, date: 1 }, data: 'confirm:x' } }), true);
  assert.equal(isAgentUpdate({ update_id: 2, message: { message_id: 1, from, chat, date: 1, photo: [{ file_id: 'p' }] } }), true);
  assert.equal(isAgentUpdate({ update_id: 3, message: { message_id: 1, from, chat: { id: -5, type: 'group' }, date: 1, photo: [{ file_id: 'p' }] } }), false);
  assert.equal(isAgentUpdate({ update_id: 4, message: { message_id: 1, from, chat, date: 1, text: 'hi' } }), false, 'text goes through the bot first');
  assert.equal(isAgentUpdate({ update_id: 5, message: { message_id: 1, from, chat: { id: -5, type: 'group' }, date: 1, new_chat_members: [{ id: 3 }] } }), false);
});
