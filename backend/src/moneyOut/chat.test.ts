import assert from 'node:assert/strict';
import test from 'node:test';
import type { OutMessage } from '../channels/render.js';
import { createMoneyOutChat } from './chat.js';
import { PAUSE_ID, removeId } from './messages.js';
import { QUIET_MS } from './rules.js';
import { createMemoryMoneyOutStore } from './store.js';

const NOW = 1_800_000_000_000;
const ALICE = '0x00000000000000000000000000000000000000aa';
const DEST = '0x00000000000000000000000000000000000000bb';

function setup(over: { enabled?: boolean; chat?: boolean; link?: string | null } = {}) {
  const store = createMemoryMoneyOutStore();
  const chat = createMoneyOutChat({
    enabled: over.enabled ?? true,
    now: () => NOW,
    store,
    isChatAccount: async () => over.chat ?? true,
    openLink: async () => (over.link === undefined ? 'https://karwan.site/o/t1' : over.link),
  });
  return { chat, store };
}

const bodyOf = (m: OutMessage | null) => (m && m.kind !== 'template' ? m.body : '');

test('a chat account back after more than 60 quiet days must prove it is the same person', async () => {
  const { chat, store } = setup();
  const m = await chat.noteReturn(ALICE, NOW - QUIET_MS - 1);
  assert.equal((await store.state(ALICE)).returnCheckDueAt, NOW);
  assert.equal(m?.kind, 'link');
  assert.match(bodyOf(m), /Welcome back/);
  assert.match(bodyOf(m), /World ID/);
  assert.equal(m?.kind === 'link' && m.url, 'https://karwan.site/o/t1');
});

test('59 quiet days, a first message, a web account, or the guard off: nothing changes', async () => {
  for (const [opts, previous] of [
    [{}, NOW - QUIET_MS + 1],
    [{}, null],
    [{ chat: false }, NOW - QUIET_MS - 1],
    [{ enabled: false }, NOW - QUIET_MS - 1],
  ] as const) {
    const { chat, store } = setup(opts);
    assert.equal(await chat.noteReturn(ALICE, previous), null);
    assert.equal((await store.state(ALICE)).returnCheckDueAt, null);
  }
});

test('Pause my money pauses every payment out at once and says how to resume', async () => {
  const { chat, store } = setup();
  const m = await chat.tap(ALICE, PAUSE_ID);
  assert.equal((await store.state(ALICE)).pausedAt, NOW);
  assert.match(bodyOf(m), /paused/i);
  assert.equal(m?.kind === 'link' && m.url, 'https://karwan.site/o/t1');
});

test('Remove takes the address off at once, and only from the tapping account', async () => {
  const { chat, store } = setup();
  const saved = await store.addAddress(ALICE, 'arc', DEST, NOW);
  const other = await chat.tap('0x00000000000000000000000000000000000000ff', removeId(saved.id));
  assert.match(bodyOf(other), /already removed/);
  assert.equal((await store.listAddresses(ALICE)).length, 1);

  const m = await chat.tap(ALICE, removeId(saved.id));
  assert.match(bodyOf(m), /Removed/);
  assert.deepEqual(await store.listAddresses(ALICE), []);
});

test('a tap that is not a money control is left to the dispatcher', async () => {
  const { chat } = setup();
  assert.equal(await chat.tap(ALICE, 'confirm:abc'), null);
});
