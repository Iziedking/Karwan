import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_RETENTION_MS, chatMessageCutoff, isChatMessageRetained, normalizeChatMessage, type ChatMessage } from './messages.js';

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

test('chat retention keeps the fourteen-day boundary and excludes older messages', () => {
  const now = 1_800_000_000_000;
  assert.equal(chatMessageCutoff(now), now - CHAT_RETENTION_MS);
  assert.equal(isChatMessageRetained(now - CHAT_RETENTION_MS, now), true);
  assert.equal(isChatMessageRetained(now - CHAT_RETENTION_MS - 1, now), false);
  assert.equal(isChatMessageRetained(Number.NaN, now), false);
});

test('image-only messages normalize without inventing body text', () => {
  const message = normalizeChatMessage({
    id: 'image-only', jobId: 'job-1', sender: '0xSeller', body: '',
    imageDataUrl: 'data:image/png;base64,AA==', ts: 2,
  });
  assert.equal(message.body, '');
  assert.equal(message.imageDataUrl, 'data:image/png;base64,AA==');
});
