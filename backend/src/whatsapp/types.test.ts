import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInbound } from './types.js';

const wrap = (message: unknown) => ({ entry: [{ changes: [{ value: { messages: [message] } }] }] });

test('button and list replies carry their reply id', () => {
  const b = parseInbound(wrap({
    id: 'a', from: '1', timestamp: '5', type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id: 'confirm:x', title: 'Confirm' } },
  }));
  assert.equal(b[0].kind, 'button');
  assert.equal(b[0].replyId, 'confirm:x');
  const l = parseInbound(wrap({
    id: 'b', from: '1', timestamp: '5', type: 'interactive',
    interactive: { type: 'list_reply', list_reply: { id: 'pick:2', title: 'Two' } },
  }));
  assert.equal(l[0].kind, 'list');
  assert.equal(l[0].replyId, 'pick:2');
});

test('images and documents are media with their id and type', () => {
  const m = parseInbound(wrap({ id: 'c', from: '1', timestamp: '5', type: 'document', document: { id: 'media-1', mime_type: 'application/pdf' } }));
  assert.deepEqual([m[0].kind, m[0].mediaId, m[0].mimeType], ['media', 'media-1', 'application/pdf']);
  const i = parseInbound(wrap({ id: 'c2', from: '1', timestamp: '5', type: 'image', image: { id: 'media-2', mime_type: 'image/jpeg', caption: 'Invoice' } }));
  assert.deepEqual([i[0].kind, i[0].mediaId, i[0].text], ['media', 'media-2', 'Invoice']);
});

test('voice notes and anything unknown are other', () => {
  assert.equal(parseInbound(wrap({ id: 'd', from: '1', timestamp: '5', type: 'audio', audio: { id: 'v' } }))[0].kind, 'other');
});

test('a malformed body yields no messages instead of throwing', () => {
  assert.deepEqual(parseInbound(null), []);
  assert.deepEqual(parseInbound({ entry: 'x' }), []);
  assert.deepEqual(parseInbound(wrap({ type: 'text' })), []);
});

test('timestamp is milliseconds', () => {
  const m = parseInbound(wrap({ id: 'e', from: '1', timestamp: '1760000000', type: 'text', text: { body: 'x' } }));
  assert.equal(m[0].timestamp, 1760000000000);
});
