import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../db/messages.js';
import { createDirectMessageRoutes } from '../routes/directMessages.js';
import { messageTools, type MessageToolDeps } from './messageTools.js';

/// "Send @bo a message" from any chat, and reading the answer, through the
/// same function the site uses. The other person's address never shows.
///
///   npx tsx --test src/assistant/messageTools.test.ts

const call = { toolCallId: 't1', messages: [] };
const NOW = 1_760_000_000_000;
const sent: ChatMessage = { id: 'dm-1', jobId: 'dm:0xada:0xb0', channel: 'direct', channelKey: 'dm:0xada:0xb0', sender: '0xada', body: 'Hello', ts: NOW };

function setup() {
  const calls: Array<[string, string, string]> = [];
  const deps: MessageToolDeps = {
    send: async (from, tag, body) => {
      calls.push([from, tag, body]);
      return { ok: true, message: sent, warning: null };
    },
    list: async () => [sent, { ...sent, id: 'dm-2', sender: '0xb0', body: 'Hi Ada', ts: NOW + 1, warning: 'Keep payment in Karwan escrow. Never pay outside it.' }],
    inbox: async () => [{ withTag: 'bo', last: 'Hi Ada', at: NOW + 1, yourTurn: true }],
    describe: async (tag) => (tag.replace(/^@/, '') === 'bo' ? { tag: 'bo', country: 'GH', tier: 'Established' } : null),
  };
  return { deps, calls };
}

test('message_person sends as the account and says how to go on', async () => {
  const s = setup();
  const out = (await messageTools('0xada', s.deps).message_person.execute!({ tag: '@bo', text: 'Hello' }, call)) as Record<string, unknown>;
  assert.deepEqual(s.calls, [['0xada', '@bo', 'Hello']]);
  assert.equal(out.sent, true);
  assert.match(String(out.next), /protected deal/);
});

test('reading a conversation shows tags, country and tier, never an address', async () => {
  const s = setup();
  const out = await messageTools('0xada', s.deps).read_my_messages.execute!({ tag: 'bo' }, call);
  const text = JSON.stringify(out);
  assert.equal(text.includes('0xb0'), false);
  assert.equal(text.includes('0xada'), false);
  assert.match(text, /"from":"you"/);
  assert.match(text, /"from":"@bo"/);
  assert.match(text, /"country":"GH"/);
  assert.match(text, /Never pay outside it/);
});

test('reading with no tag lists the conversations', async () => {
  const s = setup();
  const out = (await messageTools('0xada', s.deps).read_my_messages.execute!({}, call)) as { conversations: unknown[] };
  assert.deepEqual(out.conversations, [{ with: '@bo', last: 'Hi Ada', at: new Date(NOW + 1).toISOString(), yourTurn: true }]);
});

test('a route without a session is 401', async () => {
  const s = setup();
  const app = createDirectMessageRoutes({ ...s.deps, viewer: () => null });
  assert.equal((await app.request('/bo')).status, 401);
  assert.equal((await app.request('/bo', { method: 'POST', body: JSON.stringify({ body: 'Hi' }), headers: { 'content-type': 'application/json' } })).status, 401);
});

test('the tool and the route send through the same function', async () => {
  const s = setup();
  const app = createDirectMessageRoutes({ ...s.deps, viewer: () => '0xada' });
  const res = await app.request('/bo', { method: 'POST', body: JSON.stringify({ body: 'Hello' }), headers: { 'content-type': 'application/json' } });
  assert.equal(res.status, 200);
  await messageTools('0xada', s.deps).message_person.execute!({ tag: 'bo', text: 'Hello' }, call);
  assert.deepEqual(s.calls, [['0xada', 'bo', 'Hello'], ['0xada', 'bo', 'Hello']]);
  const view = (await (await app.request('/bo')).json()) as Record<string, unknown>;
  assert.equal(JSON.stringify(view).includes('0xb0'), false);
});

test('a refused send is a 400 with the plain reason', async () => {
  const s = setup();
  const app = createDirectMessageRoutes({
    ...s.deps,
    send: async () => ({ ok: false, message: 'No one on Karwan has that tag.' }),
    viewer: () => '0xada',
  });
  const res = await app.request('/nobody', { method: 'POST', body: JSON.stringify({ body: 'Hi' }), headers: { 'content-type': 'application/json' } });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'No one on Karwan has that tag.' });
});
