import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUpdate } from './parse.js';

const chat = { id: 555, type: 'private' };
const from = { id: 4242, is_bot: false };

test('private text becomes a text message from tg:<user id>', () => {
  const r = parseUpdate({ update_id: 1, message: { message_id: 9, from, chat, date: 1_760_000_000, text: 'I build websites' } });
  assert.deepEqual(r, {
    chatId: 555,
    inbound: { id: 'tg-1', from: 'tg:4242', timestamp: 1_760_000_000_000, kind: 'text', text: 'I build websites' },
  });
});

test('a button tap becomes a button message and carries the callback id', () => {
  const r = parseUpdate({ update_id: 2, callback_query: { id: 'cb1', from, message: { message_id: 3, chat, date: 1 }, data: 'confirm:abc' } });
  assert.equal(r?.inbound.kind, 'button');
  assert.equal(r?.inbound.replyId, 'confirm:abc');
  assert.equal(r?.callbackId, 'cb1');
  assert.equal(r?.chatId, 555);
});

test('the largest photo is taken, with its caption', () => {
  const r = parseUpdate({
    update_id: 3,
    message: {
      message_id: 1, from, chat, date: 1, caption: 'March invoice',
      photo: [{ file_id: 'small', file_size: 10, width: 90, height: 90 }, { file_id: 'big', file_size: 900, width: 1280, height: 960 }],
    },
  });
  assert.equal(r?.inbound.kind, 'media');
  assert.equal(r?.inbound.mediaId, 'big');
  assert.equal(r?.inbound.mimeType, 'image/jpeg');
  assert.equal(r?.inbound.text, 'March invoice');
});

test('a document keeps its own type', () => {
  const r = parseUpdate({ update_id: 4, message: { message_id: 1, from, chat, date: 1, document: { file_id: 'pdf1', mime_type: 'application/pdf', file_size: 2000 } } });
  assert.equal(r?.inbound.mediaId, 'pdf1');
  assert.equal(r?.inbound.mimeType, 'application/pdf');
});

test('voice, stickers and the rest are other', () => {
  const r = parseUpdate({ update_id: 5, message: { message_id: 1, from, chat, date: 1, voice: { file_id: 'v' } } });
  assert.equal(r?.inbound.kind, 'other');
});

test('groups, commands and bots never reach the agent', () => {
  assert.equal(parseUpdate({ update_id: 6, message: { message_id: 1, from, chat: { id: -100, type: 'group' }, date: 1, text: 'hi' } }), null);
  assert.equal(parseUpdate({ update_id: 7, message: { message_id: 1, from, chat, date: 1, text: '/start abc' } }), null);
  assert.equal(parseUpdate({ update_id: 8, message: { message_id: 1, from: { id: 1, is_bot: true }, chat, date: 1, text: 'hi' } }), null);
  assert.equal(parseUpdate({ update_id: 9 }), null);
});
