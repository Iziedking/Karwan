import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '../db/profiles.js';
import type { IndexedSeller } from '../matching/sellerIndex.js';
import { DIRECTORY_READ_MAX, directoryCandidates, type DirectoryDeps, type SellerRecord } from './directory.js';

/// Who an agent may find (view 72): only people who chose to be found.

const entry = (n: string, over: Partial<IndexedSeller> = {}): IndexedSeller => ({
  userAddress: `0x${n}`, sellerAddress: `0x${n}a`, words: ['tailor', 'dress'], sector: null, shapes: ['one_time'], country: 'NG', example: false, onMarket: true, updatedAt: 0, ...over,
});

const profile = (n: string, over: Partial<UserProfile> = {}): UserProfile =>
  ({
    address: `0x${n}`, role: 'seller', displayName: `Seller ${n}`, handle: n, createdAt: 0, updatedAt: 0,
    seller: { skills: ['tailor'], bio: '', minBudgetUsdc: 40, maxBudgetUsdc: 60, minDeadlineDays: 2, maxDeadlineDays: 5, keywords: ['tailor'] },
    settings: { beFound: true, meet: { atMyPlace: true, comeToYouKm: null, online: false } },
    location: { country: 'NG', city: 'Abuja', area: 'Maitama', reach: {} },
    agentWays: { sell: [{ shape: 'one_time', priceMin: 40, priceUsual: 60, daysMin: 2, daysMax: 5 }], buy: [] },
    ...over,
  }) as unknown as UserProfile;

const record: SellerRecord = { verified: true, tier: 'ESTABLISHED', rating: { kind: 'new', count: 0 }, onTimeRate: null, completed: 2, disputesLost: 0 };

const deps = (entries: IndexedSeller[], profiles: Record<string, UserProfile>, reads: string[] = []): DirectoryDeps => ({
  byWords: async () => entries,
  profile: async (u) => profiles[u] ?? null,
  record: async (u) => {
    reads.push(u);
    return record;
  },
});

const need = { keywords: ['tailor'], text: 'tailor', kind: 'in_person' as const };

test('only sellers who chose to be found are candidates, with what they set', async () => {
  const off = profile('off', { settings: { beFound: false } } as Partial<UserProfile>);
  const rows = await directoryCandidates(need, deps([entry('on'), entry('off'), entry('gone')], { '0xon': profile('on'), '0xoff': off }));
  assert.deepEqual(rows.map((r) => r.user), ['0xon']);
  assert.deepEqual(rows[0]!.meet, { atMyPlace: true, comeToYouKm: null, online: false });
  assert.deepEqual(rows[0]!.price, { min: 40, usual: 60 });
  assert.deepEqual(rows[0]!.days, { min: 2, max: 5 });
  assert.equal(rows[0]!.tag, 'on');
});

test('examples and sellers off the market are never read', async () => {
  const reads: string[] = [];
  await directoryCandidates(need, deps([entry('ex', { example: true }), entry('off', { onMarket: false })], { '0xex': profile('ex'), '0xoff': profile('off') }, reads));
  assert.deepEqual(reads, []);
});

test('no priced way: they still come up, asking for a quote', async () => {
  const rows = await directoryCandidates(need, deps([entry('q')], { '0xq': profile('q', { agentWays: { sell: [], buy: [] } } as Partial<UserProfile>) }));
  assert.equal(rows.length, 1);
});

test('at most a fixed number of fits are read', async () => {
  const many = Array.from({ length: DIRECTORY_READ_MAX + 5 }, (_, i) => entry(`s${i}`));
  const profiles = Object.fromEntries(many.map((e) => [e.userAddress, profile(e.userAddress.slice(2))]));
  const reads: string[] = [];
  await directoryCandidates(need, deps(many, profiles, reads));
  assert.equal(reads.length, DIRECTORY_READ_MAX);
});
