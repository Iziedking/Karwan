import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { createWhatsappWebhook } from './webhook.js';
import type { InboundMessage } from './types.js';

const secret = 'app-secret';
const sign = (body: string) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

function textBody(id: string, text = 'hi') {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: {
      messages: [{ id, from: '2348012345678', timestamp: '1760000000', type: 'text', text: { body: text } }],
    } }] }],
  });
}

function setup() {
  const seen = new Set<string>();
  const handled: InboundMessage[] = [];
  const app = createWhatsappWebhook({
    enabled: true,
    appSecret: secret,
    verifyToken: 'verify-me',
    markProcessed: async (id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    },
    onMessage: async (m) => {
      handled.push(m);
    },
    defer: (fn) => void fn(),
  });
  return { app, handled };
}

const post = (app: ReturnType<typeof setup>['app'], body: string, signature: string) =>
  app.request('/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': signature } });

test('GET with the right verify token echoes the challenge', async () => {
  const { app } = setup();
  const res = await app.request('/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=4242');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '4242');
});

test('GET with a wrong token is 403', async () => {
  const { app } = setup();
  const res = await app.request('/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1');
  assert.equal(res.status, 403);
});

test('POST with a bad signature is 401 and handles nothing', async () => {
  const { app, handled } = setup();
  const res = await post(app, textBody('wamid.1'), 'sha256=00');
  assert.equal(res.status, 401);
  assert.equal(handled.length, 0);
});

test('POST with a good signature is 200 and handles the message', async () => {
  const { app, handled } = setup();
  const body = textBody('wamid.2', 'I build websites');
  const res = await post(app, body, sign(body));
  assert.equal(res.status, 200);
  await new Promise((r) => setImmediate(r));
  assert.equal(handled.length, 1);
  assert.equal(handled[0].kind, 'text');
  assert.equal(handled[0].text, 'I build websites');
  assert.equal(handled[0].from, '2348012345678');
});

test('duplicate message id is ignored', async () => {
  const { app, handled } = setup();
  const body = textBody('wamid.3');
  await post(app, body, sign(body));
  await post(app, body, sign(body));
  await new Promise((r) => setImmediate(r));
  assert.equal(handled.length, 1);
});

test('status callbacks without messages are 200 with nothing handled', async () => {
  const { app, handled } = setup();
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.4', status: 'delivered' }] } }] }],
  });
  const res = await post(app, body, sign(body));
  assert.equal(res.status, 200);
  assert.equal(handled.length, 0);
});

test('a missing app secret answers 503 and handles nothing', async () => {
  const app = createWhatsappWebhook({
    enabled: true,
    appSecret: undefined,
    verifyToken: 'v',
    markProcessed: async () => true,
    onMessage: async () => {
      throw new Error('must not run');
    },
  });
  const body = textBody('wamid.5');
  const res = await app.request('/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) } });
  assert.equal(res.status, 503);
});

test('a handler failure never fails the webhook', async () => {
  const app = createWhatsappWebhook({
    enabled: true,
    appSecret: secret,
    verifyToken: 'v',
    markProcessed: async () => true,
    onMessage: async () => {
      throw new Error('turn failed');
    },
    defer: (fn) => void fn(),
  });
  const body = textBody('wamid.6');
  const res = await post(app, body, sign(body));
  assert.equal(res.status, 200);
});
