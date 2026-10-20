import assert from 'node:assert/strict';
import test from 'node:test';
import * as store from '../db/assistantConversations.js';
import { createAssistantConversationRoutes } from './assistantConversations.js';

/// Saved conversations are read and written only by the signed-in account;
/// someone else's conversation answers exactly like a missing one.
///
///   npx tsx --test src/routes/assistantConversations.test.ts

let who: string | null = '0xada';
const app = createAssistantConversationRoutes({
  sessionAddress: () => who,
  list: store.listConversations,
  get: store.getConversation,
  append: store.appendToConversation,
  remove: store.deleteConversation,
});
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

test.beforeEach(() => {
  store.__resetConversationsForTest();
  who = '0xada';
});

test('no session, no conversations', async () => {
  who = null;
  assert.equal((await app.request('/')).status, 401);
  assert.equal((await app.request('/x')).status, 401);
  assert.equal((await app.request('/', json('POST', { messages: [{ role: 'user', content: 'hi' }] }))).status, 401);
  assert.equal((await app.request('/x', { method: 'DELETE' })).status, 401);
});

test('create, append, list, open and delete your own', async () => {
  const created = await app.request('/', json('POST', { messages: [{ role: 'user', content: 'Sell rice' }, { role: 'assistant', content: 'Sure.' }] }));
  assert.equal(created.status, 200);
  const c = (await created.json()) as { conversation: { id: string; title: string } };
  assert.equal(c.conversation.title, 'Sell rice');
  const appended = await app.request('/', json('POST', { id: c.conversation.id, messages: [{ role: 'user', content: 'How much?' }] }));
  assert.equal(((await appended.json()) as { conversation: { messages: unknown[] } }).conversation.messages.length, 3);
  const list = (await (await app.request('/')).json()) as { conversations: Array<{ id: string; messages?: unknown }> };
  assert.equal(list.conversations.length, 1);
  assert.equal(list.conversations[0]!.messages, undefined);
  assert.equal((await app.request(`/${c.conversation.id}`)).status, 200);
  assert.equal((await app.request(`/${c.conversation.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await app.request(`/${c.conversation.id}`)).status, 404);
});

test("someone else's conversation is a 404 to read, append to or delete", async () => {
  const c = await store.appendToConversation('0xbob', null, [{ role: 'user', content: 'mine' }]);
  assert.equal((await app.request(`/${c.id}`)).status, 404);
  assert.equal((await app.request('/', json('POST', { id: c.id, messages: [{ role: 'user', content: 'x' }] }))).status, 404);
  assert.equal((await app.request(`/${c.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await store.getConversation('0xbob', c.id))?.messages.length, 1);
});

test('a bad body is refused', async () => {
  assert.equal((await app.request('/', json('POST', { messages: [] }))).status, 400);
  assert.equal((await app.request('/', json('POST', { messages: [{ role: 'system', content: 'x' }] }))).status, 400);
  assert.equal((await app.request('/', json('POST', { messages: Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' })) }))).status, 400);
});
