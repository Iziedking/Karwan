import assert from 'node:assert/strict';
import test from 'node:test';
import type { OutMessage } from '../channels/render.js';
import { NULLIFIER_KEEP_MS, WAIT_MS, type Standing } from './rules.js';
import { createAccountDeletion, type Eraser } from './service.js';
import { createMemoryDeletionStore } from './store.js';

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const ALICE = `0x${'a'.repeat(40)}`;
const WEB = `0x${'c'.repeat(40)}`;

const clear = (): Standing => ({ openDeals: 0, liveOffers: 0, openRequests: 0, activeBids: 0, holdings: [{ where: 'arc', micros: 0n }] });

function setup() {
  let clock = T0;
  let n = 0;
  const log: string[] = [];
  const told: { address: string; m: OutMessage }[] = [];
  let standing = clear();
  let settled = false;
  let failOnce: string | null = null;
  const store = createMemoryDeletionStore();
  const step = (name: string) => async (address: string) => {
    if (failOnce === name) {
      failOnce = null;
      throw new Error(`${name} failed`);
    }
    log.push(`${name}:${address}`);
  };
  const erase: Eraser = {
    walletIds: async () => {
      log.push('walletIds');
      return ['identity-1', 'buyer-1', 'seller-1'];
    },
    revokeFacts: step('revokeFacts'),
    factsSettled: async () => settled,
    dropFacts: step('dropFacts'),
    stores: [
      { name: 'profile', run: step('profile') },
      { name: 'agent wallets', run: step('agent wallets') },
    ],
    dropChatAccount: step('chat account'),
    releaseNullifiers: step('nullifiers'),
  };
  const service = createAccountDeletion({
    now: () => clock,
    newId: () => `del-${++n}`,
    store,
    chatAccount: async (address) => (address === ALICE ? { channel: 'telegram' } : null),
    standing: async () => standing,
    tell: async (address, m) => {
      log.push('tell');
      told.push({ address, m });
    },
    erase,
  });
  return {
    service,
    store,
    log,
    told,
    at: (ms: number) => (clock = ms),
    setStanding: (s: Standing) => (standing = s),
    settle: () => (settled = true),
    failOnce: (name: string) => (failOnce = name),
  };
}

const ids = (m: OutMessage | null) => (m?.kind === 'buttons' ? m.buttons.map((b) => b.id) : []);
const body = (m: OutMessage | null) => (m && 'body' in m ? m.body : '');

async function confirmNow(s: ReturnType<typeof setup>) {
  const card = await s.service.command(ALICE);
  const yes = ids(card).find((id) => id.startsWith('del:yes:'))!;
  return s.service.tap(ALICE, yes);
}

test('/delete shows what goes and what stays, with Delete and Keep', async () => {
  const s = setup();
  const card = await s.service.command(ALICE);
  assert.equal(card.kind, 'buttons');
  assert.deepEqual(ids(card), [`del:yes:${T0}`, 'del:no']);
  assert.match(body(card), /7 days/);
  assert.match(body(card), /12 months/);
  assert.match(body(card), /deals and payments/);
  assert.ok(body(card).length <= 1024, 'fits a chat card');
  assert.doesNotMatch(body(card), /—/);
});

test('a refusal is said at once and nothing is scheduled', async () => {
  const s = setup();
  s.setStanding({ ...clear(), openDeals: 1 });
  const card = await s.service.command(ALICE);
  assert.equal(card.kind, 'text');
  assert.match(body(card), /open deal/);
  assert.equal(await s.store.open(ALICE), null);
});

test('a web account linked to the chat is told to ask on karwan.site', async () => {
  const s = setup();
  const r = await s.service.command(WEB);
  assert.match(body(r), /karwan\.site/);
  assert.match(body(await s.service.tap(WEB, `del:yes:${T0}`)), /karwan\.site/);
  assert.equal(await s.store.open(WEB), null);
});

test('confirming schedules the deletion 7 days out, with a cancel button', async () => {
  const s = setup();
  const done = await confirmNow(s);
  const open = await s.store.open(ALICE);
  assert.equal(open?.dueAt, T0 + WAIT_MS);
  assert.equal(open?.requestedVia, 'chat');
  assert.deepEqual(ids(done), ['del:cancel']);
  assert.match(body(done), /deleted on/);
});

test('the Delete button works for 30 minutes only', async () => {
  const s = setup();
  const card = await s.service.command(ALICE);
  s.at(T0 + 31 * MIN);
  const r = await s.service.tap(ALICE, ids(card)[0]!);
  assert.match(body(r), /expired/);
  assert.equal(await s.store.open(ALICE), null);
});

test('the balance is checked again at the tap', async () => {
  const s = setup();
  const card = await s.service.command(ALICE);
  s.setStanding({ ...clear(), holdings: [{ where: 'arc', micros: 2_000_000n }] });
  const r = await s.service.tap(ALICE, ids(card)[0]!);
  assert.match(body(r), /2\.00 USDC/);
  assert.equal(await s.store.open(ALICE), null);
});

test('Keep it changes nothing', async () => {
  const s = setup();
  assert.match(body(await s.service.tap(ALICE, 'del:no')), /Nothing changes/);
});

test('/delete while one is waiting shows the date and the cancel button, and a second tap does not add another', async () => {
  const s = setup();
  await confirmNow(s);
  const again = await s.service.command(ALICE);
  assert.deepEqual(ids(again), ['del:cancel']);
  await s.service.tap(ALICE, `del:yes:${T0}`);
  assert.equal((await s.store.list(10)).length, 1);
});

test('cancel inside the wait keeps the account and nothing is erased', async () => {
  const s = setup();
  await confirmNow(s);
  s.at(T0 + WAIT_MS - MIN);
  assert.match(body(await s.service.tap(ALICE, 'del:cancel')), /Cancelled/);
  s.at(T0 + WAIT_MS + MIN);
  await s.service.sweep();
  assert.deepEqual(s.log, []);
  assert.equal((await s.store.list(1))[0]?.state, 'cancelled');
});

test('nothing runs before the 7 days end', async () => {
  const s = setup();
  await confirmNow(s);
  s.at(T0 + WAIT_MS - 1);
  await s.service.sweep();
  assert.deepEqual(s.log, []);
});

test('a deal opened during the wait stops the deletion and the person is told why', async () => {
  const s = setup();
  await confirmNow(s);
  s.setStanding({ ...clear(), openDeals: 1 });
  s.at(T0 + WAIT_MS);
  await s.service.sweep();
  const r = (await s.store.list(1))[0]!;
  assert.equal(r.state, 'refused');
  assert.equal(r.reason, 'open_deal');
  assert.match(body(s.told.at(-1)!.m), /not deleted/);
  assert.ok(!s.log.includes('profile:' + ALICE));
});

test('an unreadable balance at run time waits for the next sweep instead of refusing', async () => {
  const s = setup();
  await confirmNow(s);
  s.setStanding({ ...clear(), holdings: [{ where: 'base', micros: null }] });
  s.at(T0 + WAIT_MS);
  await s.service.sweep();
  assert.equal((await s.store.open(ALICE))?.state, 'scheduled');
  s.setStanding(clear());
  await s.service.sweep();
  assert.equal((await s.store.list(1))[0]?.state, 'erasing');
});

test('the run: wallet ids first, facts revoked, stores, the last message, then the chat row', async () => {
  const s = setup();
  await confirmNow(s);
  s.at(T0 + WAIT_MS);
  await s.service.sweep();
  assert.deepEqual(s.log, [
    'walletIds',
    `revokeFacts:${ALICE}`,
    `profile:${ALICE}`,
    `agent wallets:${ALICE}`,
    'tell',
    `chat account:${ALICE}`,
  ]);
  assert.match(body(s.told.at(-1)!.m), /Your Karwan account is deleted/);
  const r = (await s.store.list(1))[0]!;
  assert.equal(r.state, 'erasing', 'not done while a fact on Arc is not revoked yet');
  assert.deepEqual(r.record.walletIds, ['identity-1', 'buyer-1', 'seller-1']);
  assert.deepEqual(r.record.removed, ['facts', 'profile', 'agent wallets', 'chat account']);
  assert.ok(r.record.kept.some((k) => /deals/.test(k)));
});

test('done only once Arc shows every revoke; the facts record goes last and the person is told once', async () => {
  const s = setup();
  await confirmNow(s);
  s.at(T0 + WAIT_MS);
  await s.service.sweep();
  await s.service.sweep();
  s.settle();
  s.at(T0 + WAIT_MS + MIN);
  await s.service.sweep();
  const r = (await s.store.list(1))[0]!;
  assert.equal(r.state, 'done');
  assert.equal(r.closedAt, T0 + WAIT_MS + MIN);
  assert.equal(r.nullifiersUntil, T0 + WAIT_MS + MIN + NULLIFIER_KEEP_MS);
  assert.equal(s.log.at(-1), `dropFacts:${ALICE}`);
  assert.equal(s.log.filter((l) => l === 'tell').length, 1);
});

test('a step that fails is retried on the next sweep, and nothing is skipped', async () => {
  const s = setup();
  await confirmNow(s);
  s.failOnce('agent wallets');
  s.at(T0 + WAIT_MS);
  await s.service.sweep();
  assert.ok(!s.log.includes('tell'), 'no last message while a store is left');
  s.settle();
  await s.service.sweep();
  assert.ok(s.log.includes(`agent wallets:${ALICE}`));
  assert.equal((await s.store.list(1))[0]?.state, 'done');
});

test('the World ID hash is released 12 months after the deletion, once', async () => {
  const s = setup();
  await confirmNow(s);
  s.settle();
  s.at(T0 + WAIT_MS);
  await s.service.sweep();
  s.at(T0 + WAIT_MS + NULLIFIER_KEEP_MS - 1);
  await s.service.sweep();
  assert.ok(!s.log.includes(`nullifiers:${ALICE}`));
  s.at(T0 + WAIT_MS + NULLIFIER_KEEP_MS);
  await s.service.sweep();
  await s.service.sweep();
  assert.equal(s.log.filter((l) => l === `nullifiers:${ALICE}`).length, 1);
});

test('an admin request waits the same 7 days and the person can cancel it in chat', async () => {
  const s = setup();
  const r = await s.service.requestByAdmin(ALICE);
  assert.equal(r.ok, true);
  assert.equal((await s.store.open(ALICE))?.requestedVia, 'admin');
  assert.deepEqual(ids(s.told.at(-1)!.m), ['del:cancel']);
  assert.match(body(s.told.at(-1)!.m), /did not ask/);
  assert.equal((await s.service.requestByAdmin(WEB)).ok, false, 'web accounts are not deleted here');
});

test('an admin can stop a waiting deletion with a reason the person sees', async () => {
  const s = setup();
  await confirmNow(s);
  const open = (await s.store.open(ALICE))!;
  assert.equal(await s.service.refuseByAdmin(open.id, 'A dispute about this account is still being reviewed.'), true);
  assert.equal((await s.store.get(open.id))?.state, 'refused');
  assert.match(body(s.told.at(-1)!.m), /dispute about this account/);
  assert.equal(await s.service.refuseByAdmin(open.id, 'again'), false);
});

test('taps that are not deletion taps are left for others', async () => {
  const s = setup();
  assert.equal(await s.service.tap(ALICE, 'mo:pause'), null);
  assert.equal(await s.service.tap(ALICE, 'confirm:abc'), null);
});
