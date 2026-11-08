import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { block, blockedEitherWay, blockedSet, resetBlocksForTests, unblock } from './blocks.js';
import { liveNeedsOf, MAX_NEEDS, needsOf, removeNeed, resetNeedsForTests, saveNeed, TooManyNeeds, type StandingNeed } from './needs.js';

/// Standing needs and blocks (view 72), on the memory store the tests use.

beforeEach(() => {
  resetNeedsForTests();
  resetBlocksForTests();
});

const need = (n: number, over: Partial<StandingNeed> = {}): StandingNeed => ({
  id: `need-${n}`, owner: '0xRESTAURANT', what: `  tomatoes ${n}  `, every: 'week', budgetUsdc: '30', currency: 'NGN', kind: 'goods', paused: false, createdAt: n, ...over,
});

test('a buyer keeps up to ten standing needs, newest first, tidied', async () => {
  for (let i = 1; i <= MAX_NEEDS; i++) await saveNeed(need(i));
  await assert.rejects(saveNeed(need(11)), TooManyNeeds);
  const mine = await needsOf('0xrestaurant');
  assert.equal(mine.length, MAX_NEEDS);
  assert.equal(mine[0]!.id, 'need-10');
  assert.equal(mine[0]!.what, 'tomatoes 10');
  assert.equal(mine[0]!.owner, '0xrestaurant');
});

test('changing a need is not a new one, and a paused need gets no pitches', async () => {
  for (let i = 1; i <= MAX_NEEDS; i++) await saveNeed(need(i));
  await saveNeed(need(3, { paused: true }));
  const live = await liveNeedsOf(['0xRestaurant']);
  assert.equal(live.length, MAX_NEEDS - 1);
  assert.ok(!live.some((n) => n.id === 'need-3'));
});

test('only the owner removes a need', async () => {
  await saveNeed(need(1));
  assert.equal(await removeNeed('0xsomeoneelse', 'need-1'), false);
  assert.equal(await removeNeed('0xrestaurant', 'need-1'), true);
  assert.deepEqual(await needsOf('0xrestaurant'), []);
});

test('a block works both ways and lifts when undone', async () => {
  await block('0xBuyer', '0xSeller', 5);
  assert.equal(await blockedEitherWay('0xseller', '0xbuyer'), true);
  assert.deepEqual([...(await blockedSet('0xseller'))], ['0xbuyer']);
  await unblock('0xbuyer', '0xseller');
  assert.equal(await blockedEitherWay('0xbuyer', '0xseller'), false);
});

test('nobody blocks themselves', async () => {
  await block('0xada', '0xADA');
  assert.equal(await blockedEitherWay('0xada', '0xada'), false);
});
