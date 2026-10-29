import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reachForViewer, requestReach } from './requestReach.js';

///   npx tsx --test src/agents/requestReach.test.ts

const T = 1_800_000_000_000;

test('counts sellers who offered and sellers being asked, each once', () => {
  assert.deepEqual(
    requestReach({ offeredSellers: ['0xA', '0xa', '0xB'], askedSellers: ['0xC', '0xB'], postedAt: T, now: T + 5_000 }),
    { fit: 3, offered: 2, asked: 1, nobodyYet: false },
  );
});

test('nobody who fits after a minute says so; before a minute it does not', () => {
  assert.equal(requestReach({ offeredSellers: [], askedSellers: [], postedAt: T, now: T + 59_000 }).nobodyYet, false);
  assert.equal(requestReach({ offeredSellers: [], askedSellers: [], postedAt: T, now: T + 60_000 }).nobodyYet, true);
});

test('a seller being asked means somebody fits', () => {
  assert.equal(requestReach({ offeredSellers: [], askedSellers: ['0xC'], postedAt: T, now: T + 600_000 }).nobodyYet, false);
});

test('only the poster reads the reach; another person or a signed-out visitor gets nothing', async () => {
  const deps = {
    postedBy: (id: string) => (id === 'job1' ? '0xABC' : null),
    load: async () => ({ fit: 2, offered: 1, asked: 1, nobodyYet: false }),
  };
  assert.deepEqual(await reachForViewer('job1', '0xabc', deps), { fit: 2, offered: 1, asked: 1, nobodyYet: false });
  assert.equal(await reachForViewer('job1', '0xdef', deps), null);
  assert.equal(await reachForViewer('job1', null, deps), null);
  assert.equal(await reachForViewer('job2', '0xabc', deps), null);
});
