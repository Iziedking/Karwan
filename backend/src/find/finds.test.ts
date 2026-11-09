import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { deleteBlocksOf, block, blockedSet, resetBlocksForTests } from './blocks.js';
import { asOf, deleteFindsOf, ownerView, FIND_DAYS, findEndsAt, findOf, myFinds, resetFindsForTests, saveFind, type Find } from './finds.js';
import { deleteNeedsOf, needsOf, resetNeedsForTests, saveNeed } from './needs.js';

/// A person's finds (view 72), on the memory store the tests use.

const DAY = 86_400_000;

beforeEach(() => {
  resetFindsForTests();
  resetNeedsForTests();
  resetBlocksForTests();
});

const find = (n: number, over: Partial<Find> = {}): Find => ({
  id: `find-${n}`, owner: '0xBUYER', side: 'buyer', mode: 'choose', need: 'a tailor', budgetUsdc: '70', kind: 'in_person', where: { scope: 'near' },
  jobId: null, needId: null, rows: [], status: 'shortlisted', createdAt: n, endsAt: n + 7 * DAY, ...over,
});

test('a find ends at the request deadline when sooner, else after a week', () => {
  assert.equal(FIND_DAYS, 7);
  assert.equal(findEndsAt(0, null), 7 * DAY);
  assert.equal(findEndsAt(0, 3 * DAY), 3 * DAY);
  assert.equal(findEndsAt(0, 30 * DAY), 7 * DAY);
  assert.equal(asOf(find(1, { endsAt: 10 }), 10).status, 'ended');
  assert.equal(asOf(find(1, { endsAt: 10 }), 9).status, 'shortlisted');
});

test('finds are the owner\'s alone, newest first', async () => {
  await saveFind(find(1));
  await saveFind(find(2));
  await saveFind(find(3, { owner: '0xother' }));
  assert.deepEqual((await myFinds('0xbuyer', 5)).map((f) => f.id), ['find-2', 'find-1']);
  assert.equal((await findOf('0xbuyer', 'find-1', 5))?.id, 'find-1');
  assert.equal(await findOf('0xother', 'find-1', 5), null);
  assert.equal(await findOf('0xstranger', 'find-3', 5), null);
});

test('deleting an account clears its finds, needs and blocks both ways', async () => {
  await saveFind(find(1));
  await saveNeed({ id: 'n1', owner: '0xbuyer', what: 'tomatoes', every: 'week', budgetUsdc: null, currency: null, kind: 'goods', paused: false, createdAt: 1 });
  await block('0xbuyer', '0xa');
  await block('0xb', '0xbuyer');
  await block('0xc', '0xd');
  await deleteFindsOf('0xBUYER');
  await deleteNeedsOf('0xBUYER');
  await deleteBlocksOf('0xBUYER');
  assert.deepEqual(await myFinds('0xbuyer'), []);
  assert.deepEqual(await needsOf('0xbuyer'), []);
  assert.deepEqual([...(await blockedSet('0xa'))], []);
  assert.deepEqual([...(await blockedSet('0xb'))], []);
  assert.deepEqual([...(await blockedSet('0xc'))], ['0xd']);
});

test('the owner reads people by name and tag, never a wallet', () => {
  const row = { user: '0xseller', sellerAgent: '0xagent', tag: 'ngozi', name: 'Ngozi', verified: true, tier: 'ESTABLISHED' as const, rating: 'New, 0 ratings so far', stars: null, ratings: 0,
    distance: { key: 'nearby' as const }, meet: { atMyPlace: true, comeToYouKm: null, online: false }, priceUsdc: '60', days: 5, reasons: [], recommended: true };
  const view = ownerView(find(1, { rows: [row] }), new Map([['0xseller', 'data:image/jpeg;base64,AAAA']]));
  const text = JSON.stringify(view);
  assert.equal(text.includes('0xseller'), false);
  assert.equal(text.includes('0xagent'), false);
  assert.equal(text.includes('0xBUYER'), false);
  assert.equal(view.rows[0]!.tag, 'ngozi');
  assert.equal(view.rows[0]!.photo, 'data:image/jpeg;base64,AAAA');
  assert.equal(ownerView(find(1, { rows: [row] })).rows[0]!.photo, null);
});
