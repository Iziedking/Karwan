import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverReply, replyRoute } from './replyRoute.js';

test('telegram first when the person last wrote there', () => {
  assert.deepEqual(replyRoute({ lastChannel: 'telegram', address: '0xa' }, { telegramLinked: true, verifiedEmail: 'a@x.com' }), ['telegram', 'email']);
});

test('email first for an email case', () => {
  assert.deepEqual(replyRoute({ lastChannel: 'email', email: 'a@x.com', address: '0xa' }, { telegramLinked: true }), ['email', 'telegram']);
});

test('no telegram link falls back to email', () => {
  assert.deepEqual(replyRoute({ lastChannel: 'telegram', address: '0xa' }, { telegramLinked: false, verifiedEmail: 'a@x.com' }), ['email']);
});

test('a website case is told on telegram, else email', () => {
  assert.deepEqual(replyRoute({ lastChannel: 'web', address: '0xa' }, { telegramLinked: true, verifiedEmail: 'a@x.com' }), ['telegram', 'email']);
  assert.deepEqual(replyRoute({ lastChannel: 'web', address: '0xa' }, { telegramLinked: false, verifiedEmail: 'a@x.com' }), ['email']);
});

test('a guest with neither reaches only the case page', () => {
  assert.deepEqual(replyRoute({ lastChannel: 'web' }, { telegramLinked: false }), []);
});

test('a bounce tries the next channel and records only what took it', async () => {
  const tried: string[] = [];
  const took = await deliverReply(['email', 'telegram'], {
    email: async () => { tried.push('email'); return false; },
    telegram: async () => { tried.push('telegram'); return true; },
  });
  assert.deepEqual(tried, ['email', 'telegram']);
  assert.deepEqual(took, ['telegram']);
});

test('the first channel that takes it is the only one used', async () => {
  const tried: string[] = [];
  const took = await deliverReply(['telegram', 'email'], {
    email: async () => { tried.push('email'); return true; },
    telegram: async () => { tried.push('telegram'); return true; },
  });
  assert.deepEqual(tried, ['telegram']);
  assert.deepEqual(took, ['telegram']);
});

test('a channel that throws counts as not taken', async () => {
  const took = await deliverReply(['telegram', 'email'], {
    telegram: async () => { throw new Error('down'); },
    email: async () => true,
  });
  assert.deepEqual(took, ['email']);
});
