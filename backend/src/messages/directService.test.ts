import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../db/messages.js';
import { createDirect, type DirectAlert, type DirectDeps } from './directService.js';
import type { SenderHistory } from './direct.js';

/// Messaging someone by tag: stored once under the pair, read by both sides,
/// refused plainly when the tag is no one's.
///
///   npx tsx --test src/messages/directService.test.ts

const NOW = 1_760_000_000_000;
const people: Record<string, string> = { ada: '0xada', bo: '0xb0' };

function fakeDirect(over: Partial<DirectDeps> = {}) {
  const store: ChatMessage[] = [];
  const histories = new Map<string, SenderHistory>();
  const alerts: DirectAlert[] = [];
  const reads = new Map<string, Record<string, number>>();
  let now = NOW;
  const deps: DirectDeps = {
    now: () => now,
    findByTag: async (tag) => {
      const t = tag.replace(/^@/, '').toLowerCase();
      return people[t] ? { address: people[t]!, tag: t } : null;
    },
    tagOf: async (address) => Object.keys(people).find((t) => people[t] === address.toLowerCase()) ?? null,
    getHistory: async (a) => histories.get(a) ?? { firstMessages: [] },
    putHistory: async (a, h) => void histories.set(a, h),
    add: async (m) => {
      store.push(m);
      return m;
    },
    list: async (key) => store.filter((m) => m.channelKey === key),
    threadsFor: async (owner) => store.filter((m) => m.channelKey?.includes(owner.toLowerCase())),
    hasDeal: async () => false,
    alert: async (a) => void alerts.push(a),
    scan: () => ({ verdict: 'clean', reasons: [] }),
    offense: () => {},
    dropHistory: async () => {},
    dropMessages: async () => {},
    getRead: async (owner) => reads.get(owner) ?? {},
    putRead: async (owner, read) => void reads.set(owner, read),
    dropRead: async (owner) => void reads.delete(owner),
    ...over,
  };
  return { direct: createDirect(deps), store, alerts, histories, advance: (ms: number) => (now += ms) };
}

test('an unknown or deleted tag is refused plainly', async () => {
  const f = fakeDirect();
  const r = await f.direct.send('0xada', '@nobody', 'Hello');
  assert.deepEqual(r, { ok: false, code: 'unknown_tag', message: 'No one on Karwan has that tag.' });
  assert.equal(f.store.length, 0);
});

test('a message is stored once and both sides see it', async () => {
  const f = fakeDirect();
  const r = await f.direct.send('0xada', '@bo', 'Do you make agbada?');
  assert.equal(r.ok, true);
  assert.equal(f.store.length, 1);
  assert.equal(f.store[0]!.channel, 'direct');
  assert.equal(f.store[0]!.channelKey, 'dm:0xada:0xb0');
  assert.equal((await f.direct.list('0xada', 'bo')).length, 1);
  assert.equal((await f.direct.list('0xb0', '@ada')).length, 1);
});

test('your own tag is refused', async () => {
  const f = fakeDirect();
  const r = await f.direct.send('0xada', '@ada', 'Hi me');
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : '', /your own tag/);
});

test('an empty message is refused and a long one is cut', async () => {
  const f = fakeDirect();
  assert.equal((await f.direct.send('0xada', '@bo', '   ')).ok, false);
  await f.direct.send('0xada', '@bo', 'x'.repeat(5000));
  assert.equal(f.store[0]!.body.length, 2000);
});

test('a reply marks the first message answered, so it never counts toward the pause', async () => {
  const f = fakeDirect();
  await f.direct.send('0xada', '@bo', 'Hello');
  await f.direct.send('0xb0', '@ada', 'Hi Ada');
  assert.deepEqual(f.histories.get('0xada')?.firstMessages.map((m) => m.answered), [true]);
  assert.deepEqual(f.histories.get('0xb0')?.firstMessages ?? [], []);
});

test('a contact detail before any deal carries the escrow warning to the reader', async () => {
  const f = fakeDirect();
  const r = await f.direct.send('0xada', '@bo', 'Pay me at https://pay.example.com');
  assert.equal(r.ok && r.warning, 'Keep payment in Karwan escrow. Never pay outside it.');
  assert.equal(f.store[0]!.warning, 'Keep payment in Karwan escrow. Never pay outside it.');
});

test('a paused sender is told when they can write to someone new', async () => {
  const many: Record<string, string> = { ...people, c1: '0xc1', c2: '0xc2', c3: '0xc3', c4: '0xc4', c5: '0xc5', c6: '0xc6' };
  const f = fakeDirect({
    findByTag: async (tag) => {
      const t = tag.replace(/^@/, '');
      return many[t] ? { address: many[t]!, tag: t } : null;
    },
  });
  for (const t of ['c1', 'c2', 'c3', 'c4', 'c5']) assert.equal((await f.direct.send('0xada', `@${t}`, 'Hi')).ok, true);
  const r = await f.direct.send('0xada', '@c6', 'Hi');
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : '', /five people today/);
  assert.equal((await f.direct.send('0xada', '@c1', 'Following up')).ok, true);
});

test('the inbox lists each conversation once with the latest message', async () => {
  const f = fakeDirect();
  await f.direct.send('0xada', '@bo', 'Hello');
  f.advance(1000);
  await f.direct.send('0xb0', '@ada', 'Hi Ada');
  const inbox = await f.direct.inbox('0xada');
  assert.deepEqual(inbox, [{ withTag: 'bo', last: 'Hi Ada', at: NOW + 1000, yourTurn: true, unread: true }]);
});

const crowd: Record<string, string> = { ...people, c1: '0xc1', c2: '0xc2', c3: '0xc3', c4: '0xc4', c5: '0xc5', c6: '0xc6', c7: '0xc7' };
const crowdDeps: Partial<DirectDeps> = {
  findByTag: async (tag) => {
    const t = tag.replace(/^@/, '');
    return crowd[t] ? { address: crowd[t]!, tag: t } : null;
  },
  tagOf: async (address) => Object.keys(crowd).find((t) => crowd[t] === address.toLowerCase()) ?? null,
};

test('sending to many new people at once still pauses after five', async () => {
  const f = fakeDirect(crowdDeps);
  const results = await Promise.all(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].map((t) => f.direct.send('0xada', `@${t}`, 'Hi')));
  assert.equal(results.filter((r) => r.ok).length, 5);
  assert.equal(f.histories.get('0xada')?.firstMessages.length, 5);
});

test('three messages in a row with no reply wait for the other person', async () => {
  const f = fakeDirect();
  for (let i = 0; i < 3; i++) assert.equal((await f.direct.send('0xada', '@bo', `m${i}`)).ok, true);
  const fourth = await f.direct.send('0xada', '@bo', 'hello?');
  assert.equal(fourth.ok, false);
  assert.equal(!fourth.ok && fourth.code, 'wait_reply');
  await f.direct.send('0xb0', '@ada', 'Sorry, here now');
  assert.equal((await f.direct.send('0xada', '@bo', 'Great')).ok, true);
});

test('a paused sender can answer someone who wrote to them first', async () => {
  const f = fakeDirect(crowdDeps);
  for (const t of ['c1', 'c2', 'c3', 'c4', 'c5']) await f.direct.send('0xada', `@${t}`, 'Hi');
  await f.direct.send('0xc7', '@ada', 'Do you sell fabric?');
  assert.equal((await f.direct.send('0xada', '@c7', 'Yes I do')).ok, true);
});

test('a sender with no tag is asked to pick one first', async () => {
  const f = fakeDirect({ tagOf: async () => null });
  const r = await f.direct.send('0xnotag', '@bo', 'Hi');
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, 'no_tag');
  assert.equal(f.store.length, 0);
});

test('a flagged link is refused and recorded, like trade chat', async () => {
  const flagged: string[] = [];
  const f = fakeDirect({
    scan: (text) => (text.includes('evil') ? { verdict: 'malicious', reasons: ['phishing'] } : { verdict: 'clean', reasons: [] }),
    offense: (address) => void flagged.push(address),
  });
  const r = await f.direct.send('0xada', '@bo', 'Pay here https://evil.example');
  assert.equal(!r.ok && r.code, 'link_blocked');
  assert.deepEqual(flagged, ['0xada']);
  assert.equal(f.store.length, 0);
});

test('deleting an account removes its direct messages and who it wrote to', async () => {
  const removed: string[] = [];
  const f = fakeDirect({ dropHistory: async (a) => void removed.push(`history:${a}`), dropMessages: async (a) => void removed.push(`messages:${a}`) });
  await f.direct.send('0xada', '@bo', 'Hello');
  await f.direct.forget('0xADA');
  assert.deepEqual(removed, ['history:0xada', 'messages:0xada']);
});

test('opening a conversation clears its alert before any reply, and a new message brings it back', async () => {
  const f = fakeDirect();
  await f.direct.send('0xb0', '@ada', 'Do you make agbada?');
  assert.equal((await f.direct.inbox('0xada'))[0]!.unread, true);
  f.advance(1000);
  await f.direct.list('0xada', 'bo');
  const opened = (await f.direct.inbox('0xada'))[0]!;
  assert.equal(opened.unread, false);
  assert.equal(opened.yourTurn, true, 'still their move to answer');
  f.advance(1000);
  await f.direct.send('0xb0', '@ada', 'For a wedding in December');
  assert.equal((await f.direct.inbox('0xada'))[0]!.unread, true);
});

test('the sender never has an alert for their own message', async () => {
  const f = fakeDirect();
  await f.direct.send('0xada', '@bo', 'Hello');
  assert.equal((await f.direct.inbox('0xada'))[0]!.unread, false);
});

test('a message from an ad carries what it is about, only when the ad is theirs', async () => {
  const ads: Record<string, { title: string; owner: string }> = {
    'listing:lst_1': { title: 'Blue Tecno Spark 20', owner: '0xb0' },
    'listing:lst_2': { title: 'Someone else’s phone', owner: '0xc3' },
  };
  const f = fakeDirect({ aboutOf: async (a) => ads[`${a.kind}:${a.id}`] ?? null });
  const r = await f.direct.send('0xada', '@bo', 'Does it come with a charger?', { kind: 'listing', id: 'lst_1' });
  assert.equal(r.ok, true);
  assert.deepEqual(f.store[0]!.about, { kind: 'listing', id: 'lst_1', title: 'Blue Tecno Spark 20' });
  // An ad that is not the receiver's, or does not exist, is left off; the message still goes.
  await f.direct.send('0xada', '@bo', 'And this one?', { kind: 'listing', id: 'lst_2' });
  await f.direct.send('0xada', '@bo', 'Or this?', { kind: 'request', id: 'nope' });
  assert.equal(f.store.length, 3);
  assert.equal(f.store[1]!.about, undefined);
  assert.equal(f.store[2]!.about, undefined);
});
