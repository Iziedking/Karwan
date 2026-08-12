import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeChatMessage, type ChatMessage } from './messages.js';

test('legacy messages without a sender normalize as system records', () => {
  const message = normalizeChatMessage({
    id: 'legacy-system',
    jobId: 'job-1',
    body: 'Delivery proof submitted.',
    ts: 1,
  } as ChatMessage);

  assert.equal(message.sender, '');
  assert.equal(message.kind, 'system');
  assert.equal(message.channel, 'trade');
  assert.equal(message.channelKey, 'job-1');
});

test('participant messages retain their sender', () => {
  const message = normalizeChatMessage({
    id: 'participant',
    jobId: 'job-1',
    sender: '0xSeller',
    body: 'The order is ready.',
    ts: 2,
  });

  assert.equal(message.sender, '0xSeller');
  assert.equal(message.kind, 'participant');
});

test('financing replies retain their same-channel reference', () => {
  const message = normalizeChatMessage({
    id: 'reply',
    jobId: 'job-1',
    channel: 'financing',
    channelKey: 'position-1',
    sender: '0xFinancier',
    body: 'I can confirm that date.',
    replyToId: 'original',
    ts: 3,
  });

  assert.equal(message.replyToId, 'original');
});
