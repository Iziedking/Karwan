import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverDirectAlert, directAlertEmail, directAlertText, type AlertDeps } from './alerts.js';

/// A message by tag reaches the person on Telegram and by email, naming the
/// sender by tag and country only, and never once they muted alerts.
///
///   npx tsx --test src/messages/alerts.test.ts

const alert = { from: '0xada', to: '0xb0', fromTag: 'ada', preview: 'Do you make agbada? I am in Yaba.', warning: null };

function setup(over: Partial<AlertDeps> = {}) {
  const sent: string[] = [];
  const deps: AlertDeps = {
    countryOf: async () => 'NG',
    contact: async () => ({ muted: false, email: 'bo@example.com', telegramChatId: 42 }),
    telegram: async (_chat, text) => void sent.push(`tg:${text}`),
    remember: async (_a, text) => void sent.push(`history:${text}`),
    email: async (to, c) => void sent.push(`email:${to}:${c.subject}`),
    baseUrl: 'https://karwan.site',
    ...over,
  };
  return { deps, sent };
}

test('the alert names the sender\'s tag and country only', () => {
  const text = directAlertText({ ...alert, fromCountry: 'NG' });
  assert.match(text, /^Message from @ada \(Nigeria\): Do you make agbada\?/);
  assert.equal(text.includes('0xada'), false);
  const mail = directAlertEmail({ ...alert, fromCountry: 'NG' }, 'https://karwan.site');
  assert.equal(mail.subject, 'Message from @ada');
  assert.equal(mail.ctaUrl, 'https://karwan.site/messages/ada');
  assert.equal(JSON.stringify(mail).includes('0xada'), false);
});

test('a long message is cut to 200 characters and the warning is its own line', () => {
  const text = directAlertText({ ...alert, fromCountry: null, preview: 'x'.repeat(500), warning: 'Keep payment in Karwan escrow. Never pay outside it.' });
  assert.match(text, /^Message from @ada: x{199}…\nKeep payment in Karwan escrow\. Never pay outside it\./);
});

test('the person is told on Telegram and by email, and the chat remembers it', async () => {
  const s = setup();
  await deliverDirectAlert(alert, s.deps);
  assert.equal(s.sent.length, 3);
  assert.match(s.sent[0]!, /^tg:Message from @ada \(Nigeria\)/);
  assert.equal(s.sent[1], 'history:A message from @ada (Nigeria) arrived. Read it with read_my_messages before answering.');
  assert.equal(s.sent[1]!.includes('agbada'), false);
  assert.equal(s.sent[2], 'email:bo@example.com:Message from @ada');
});

test('a muted account gets no email and no Telegram alert', async () => {
  const s = setup({ contact: async () => ({ muted: true, email: 'bo@example.com', telegramChatId: 42 }) });
  await deliverDirectAlert(alert, s.deps);
  assert.deepEqual(s.sent, []);
});

test('no verified email and no Telegram means nothing is sent', async () => {
  const s = setup({ contact: async () => ({ muted: false, email: null, telegramChatId: null }) });
  await deliverDirectAlert(alert, s.deps);
  assert.deepEqual(s.sent, []);
});
