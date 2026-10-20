import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetConversationsForTest,
  appendToConversation,
  deleteConversation,
  deleteConversationsOf,
  getConversation,
  listConversations,
} from './assistantConversations.js';

/// Assistant conversations saved to the account: at most 40 messages each
/// and 50 per account, readable only by their owner, and past confirm cards
/// come back as a record, never as something to confirm.
///
///   npx tsx --test src/db/assistantConversations.test.ts

const A = '0xAAA0000000000000000000000000000000000001';
const B = '0xbbb0000000000000000000000000000000000002';
const user = (content: string) => ({ role: 'user' as const, content });
const assistant = (content: string, actions?: unknown[]) => ({ role: 'assistant' as const, content, ...(actions ? { actions } : {}) });

test.beforeEach(() => __resetConversationsForTest());

test('a new conversation is titled by its first message, trimmed to 60', async () => {
  const long = 'I want to sell forty bags of rice to a shop in Kano before the end of the month please';
  const c = await appendToConversation(A, null, [user(long), assistant('Sure.')]);
  assert.equal(c.title, long.slice(0, 60).trim());
  assert.equal(c.address, A.toLowerCase());
  assert.equal(c.messages.length, 2);
  assert.deepEqual((await getConversation(A, c.id))?.messages, c.messages);
});

test('appending keeps the title and the 41st message drops the oldest', async () => {
  let c = await appendToConversation(A, null, [user('first')]);
  for (let i = 1; i < 41; i++) c = await appendToConversation(A, c.id, [assistant(`m${i}`)]);
  assert.equal(c.messages.length, 40);
  assert.equal(c.messages[0]!.content, 'm1');
  assert.equal(c.messages.at(-1)!.content, 'm40');
  assert.equal(c.title, 'first');
});

test('the 51st conversation drops the one used longest ago', async () => {
  const ids: string[] = [];
  for (let i = 0; i < 50; i++) ids.push((await appendToConversation(A, null, [user(`c${i}`)])).id);
  // Using the first one again makes the second the oldest.
  await appendToConversation(A, ids[0]!, [user('again')]);
  await appendToConversation(A, null, [user('c50')]);
  const list = await listConversations(A);
  assert.equal(list.length, 50);
  assert.ok(list.some((c) => c.id === ids[0]));
  assert.ok(!list.some((c) => c.id === ids[1]));
  assert.equal(list[0]!.title, 'c50');
});

test('another account cannot read, append to or delete a conversation', async () => {
  const c = await appendToConversation(A, null, [user('mine')]);
  assert.equal(await getConversation(B, c.id), null);
  await assert.rejects(appendToConversation(B, c.id, [user('theirs')]), /not_found/);
  assert.equal(await deleteConversation(B, c.id), false);
  assert.equal((await getConversation(A, c.id))?.messages.length, 1);
  assert.deepEqual(await listConversations(B), []);
});

test('a past confirm card is stored with a status and without its id or payload', async () => {
  const card = {
    kind: 'confirm', id: 'save_setup:abc123', intent: 'save_setup', title: "Here's your Karwan",
    fields: [{ label: '', value: 'x' }], payload: { answers: { goals: ['work'] } }, nonce: 'n1', status: 'done',
  };
  const c = await appendToConversation(A, null, [user('set me up'), assistant('Here it is.', [card, { ...card, id: 'save_setup:2', status: 'pending' }])]);
  const [done, left] = c.messages[1]!.actions!;
  assert.equal(done!.status, 'done');
  assert.equal(left!.status, 'expired');
  for (const a of [done!, left!]) {
    assert.equal('id' in a, false);
    assert.equal('payload' in a, false);
    assert.equal('nonce' in a, false);
    assert.equal(a.title, "Here's your Karwan");
  }
});

test('deleting removes it for its owner, and account deletion removes them all', async () => {
  const one = await appendToConversation(A, null, [user('one')]);
  await appendToConversation(A, null, [user('two')]);
  await appendToConversation(B, null, [user('theirs')]);
  assert.equal(await deleteConversation(A, one.id), true);
  assert.equal(await getConversation(A, one.id), null);
  await deleteConversationsOf(A);
  assert.deepEqual(await listConversations(A), []);
  assert.equal((await listConversations(B)).length, 1);
});
