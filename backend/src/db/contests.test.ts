import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryContestsStore, type Contest, type ContestEntry } from './contests.js';

/// Contests and their entries (view 40).

const contest = (over: Partial<Contest> = {}): Contest => ({
  id: 'c_1', buyer: '0x1111111111111111111111111111111111111111', buyerAgent: '0x2222222222222222222222222222222222222222',
  title: 'Best logo', brief: 'A logo for a bakery', tags: ['logo'], prizeMicros: '300000000', feeBps: 100,
  shares: [5000, 3000, 2000], entriesBy: 2_000, awardBy: 3_000, status: 'opening', createdAt: 1, updatedAt: 1, ...over,
});
const entry = (over: Partial<ContestEntry> = {}): ContestEntry => ({
  id: 'e_1', contestId: 'c_1', seller: '0x3333333333333333333333333333333333333333', sellerAgent: '0x4444444444444444444444444444444444444444',
  note: 'three colours', previewId: 'e_1', files: 1, fingerprint: '0x01', status: 'in', createdAt: 1, updatedAt: 1, ...over,
});

test('a status change happens only from the status it expects', async () => {
  const s = memoryContestsStore();
  await s.create(contest());
  assert.equal((await s.patchIfStatus('c_1', ['opening'], { status: 'open', chainId: '4' }))?.status, 'open');
  assert.equal(await s.patchIfStatus('c_1', ['opening'], { status: 'failed' }), null, 'a second tap finds it moved on');
  assert.equal((await s.get('c_1'))?.chainId, '4');
});

test('open contests are listed for the market; a buyer sees their own', async () => {
  const s = memoryContestsStore();
  await s.create(contest({ id: 'c_1', status: 'open' }));
  await s.create(contest({ id: 'c_2', status: 'awarded' }));
  await s.create(contest({ id: 'c_3', status: 'open', buyer: '0x9999999999999999999999999999999999999999' }));
  assert.deepEqual((await s.list({ status: ['open'] })).map((c) => c.id).sort(), ['c_1', 'c_3']);
  assert.deepEqual((await s.list({ buyer: '0x1111111111111111111111111111111111111111' })).map((c) => c.id).sort(), ['c_1', 'c_2']);
});

test("a seller's live entry is the one not replaced", async () => {
  const s = memoryContestsStore();
  await s.createEntry(entry({ id: 'e_1', status: 'replaced' }));
  await s.createEntry(entry({ id: 'e_2', status: 'in' }));
  assert.equal((await s.liveEntryBy('c_1', '0x3333333333333333333333333333333333333333'))?.id, 'e_2');
  assert.deepEqual((await s.entries('c_1')).map((e) => e.id).sort(), ['e_1', 'e_2']);
});
