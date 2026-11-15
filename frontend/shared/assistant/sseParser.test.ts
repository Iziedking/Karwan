import assert from 'node:assert/strict';
import test from 'node:test';
import { SseParser } from './sseParser';

test('a frame split across chunks', () => {
  const p = new SseParser();
  assert.deepEqual(p.push('event: sta'), []);
  assert.deepEqual(p.push('tus\ndata: {"tool":"x"}\n\n'), [{ event: 'status', data: '{"tool":"x"}' }]);
});

test('keep-alive comments are dropped', () => {
  assert.deepEqual(new SseParser().push(': keep-alive\n\n'), []);
});

test('two frames in one chunk', () => {
  const got = new SseParser().push('event: status\ndata: {"tool":"a"}\n\nevent: done\ndata: {"reply":"Hi"}\n\n');
  assert.deepEqual(got, [
    { event: 'status', data: '{"tool":"a"}' },
    { event: 'done', data: '{"reply":"Hi"}' },
  ]);
});

test('CRLF line ends', () => {
  assert.deepEqual(new SseParser().push('event: retrying\r\ndata: {}\r\n\r\n'), [{ event: 'retrying', data: '{}' }]);
});

test('a frame with no event name is a message', () => {
  assert.deepEqual(new SseParser().push('data: x\n\n'), [{ event: 'message', data: 'x' }]);
});
