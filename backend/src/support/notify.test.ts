import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryCaseStore, useCaseStoreForTests } from './cases.js';

const store = memoryCaseStore('testnet');
useCaseStoreForTests(store);
const { notifyUserOfReply } = await import('./notify.js');
const { getConversation } = await import('./store.js');

test('a reply records the channel that took it on the message', async () => {
  const c = await store.open({ address: '0xabc', contactVerified: true, kind: 'other', records: [], channel: 'telegram', text: 'Hi', role: 'person', now: Date.now() });
  const m = await store.add(c.id, { role: 'teammate', channel: 'desk', text: 'Hello', at: Date.now() });
  const took = await notifyUserOfReply((await getConversation(c.ref))!, 'Hello', {
    messageId: m.id,
    reach: async () => ({ telegramLinked: true }),
    send: { telegram: async () => true, email: async () => true },
  });
  assert.deepEqual(took, ['telegram']);
  const stored = (await store.messages(c.id, { forPerson: false })).find((x) => x.id === m.id);
  assert.deepEqual(stored?.deliveredVia, ['telegram']);
});

test('a guest case with no channel records nothing taken', async () => {
  const c = await store.open({ contactVerified: false, kind: 'other', records: [], channel: 'web', text: 'Hi', role: 'person', now: Date.now() });
  const m = await store.add(c.id, { role: 'teammate', channel: 'desk', text: 'Hello', at: Date.now() });
  const took = await notifyUserOfReply((await getConversation(c.ref))!, 'Hello', {
    messageId: m.id,
    reach: async () => ({ telegramLinked: false }),
    send: { telegram: async () => true, email: async () => true },
  });
  assert.deepEqual(took, []);
});
