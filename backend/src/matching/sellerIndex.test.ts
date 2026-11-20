import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { UserProfile } from '../db/profiles.js';
import { indexEntry, rankSellers, requestsForSeller, sellerIndex, type IndexedSeller } from './sellerIndex.js';

/// Who sells what, in memory (view 41): a request is matched against the index,
/// and a seller who just saved is matched against the open requests.
///
///   npx tsx --test src/matching/sellerIndex.test.ts

const profile = (over: Partial<UserProfile> & { seller?: UserProfile['seller'] }): UserProfile =>
  ({
    address: '0xowner',
    role: 'seller',
    displayName: 'Ada',
    createdAt: 0,
    updatedAt: 0,
    seller: { skills: ['shoes'], bio: 'Clark shoes', minBudgetUsdc: 30, maxBudgetUsdc: 32, minDeadlineDays: 1, maxDeadlineDays: 5, keywords: ['shoes', 'footwear'] },
    ...over,
  }) as unknown as UserProfile;

const agents = (n: string) => ({ userAddress: `0x${n.repeat(40)}`, sellerAddress: `0x${n.repeat(39)}5` });

const entry = (n: string, words: string[], over: Partial<IndexedSeller> = {}): IndexedSeller => ({
  userAddress: `0x${n.repeat(40)}`,
  sellerAddress: `0x${n.repeat(39)}5`,
  words,
  text: words.join('. '),
  sector: null,
  shapes: ['one_time'],
  country: null,
  example: false,
  onMarket: true,
  updatedAt: 1,
  ...over,
});

test('an entry carries the words, sector, ways and place a seller is matched on', () => {
  const e = indexEntry(agents('a'), profile({ smeProfile: { sector: 'textiles' } as UserProfile['smeProfile'], location: { country: 'NG', city: 'Lagos', area: null, reach: {} } as UserProfile['location'] }));
  assert.deepEqual(e?.words, ['shoes', 'footwear']);
  assert.equal(e?.sector, 'textiles');
  assert.deepEqual(e?.shapes, ['one_time']);
  assert.equal(e?.country, 'NG');
  assert.equal(e?.onMarket, true);
  assert.equal(indexEntry(agents('a'), profile({ seller: undefined })), null);
  assert.equal(indexEntry(agents('a'), profile({ agentPrefs: { findClients: false } }))?.onMarket, false);
});

test('a request reaches every seller sharing a word, and at most the limit without one, never an example', () => {
  const index = [
    entry('1', ['shoes', 'sandals']),
    entry('2', ['logo', 'branding']),
    entry('3', ['photography']),
    entry('4', ['leather', 'bags'], { sector: 'textiles' }),
    entry('5', ['shoes'], { example: true }),
    entry('6', ['shoes'], { onMarket: false }),
  ];
  const request = { jobId: '0xj', keywords: ['shoes', 'size 42'], briefText: '3 pairs of Clark shoes', sourcingSector: 'textiles', tradeType: 'goods' as const };
  const { byWords, toJudge, skipped } = rankSellers(index, request, 2);
  assert.deepEqual(byWords.map((s) => s.userAddress[2]), ['1']);
  assert.deepEqual(toJudge.map((s) => s.userAddress[2]), ['4', '2'], 'the sector fit first, then the limit');
  assert.equal(skipped, 1);
  assert.equal(rankSellers(index, { jobId: '0xj', keywords: ['shoes'] }).toJudge.length, 3, 'the default limit takes everyone on the market without a shared word');
});

test('a seller who saves a goods way for shoes fits the open shoe request, and nothing else', () => {
  const open = [
    { jobId: '0xshoes', keywords: ['shoes', 'size 42'], briefText: '3 pairs of Clark shoes', tradeType: 'goods' as const },
    { jobId: '0xlogo', keywords: ['logo', 'branding'], briefText: 'A logo for a bakery' },
    { jobId: '0xtextiles', keywords: ['fabric'], briefText: '500 yards of fabric', sourcingSector: 'textiles' },
  ];
  const shoes = entry('1', ['shoes', 'footwear'], { shapes: ['goods'] });
  assert.deepEqual(requestsForSeller(shoes, open).map((r) => r.jobId), ['0xshoes']);
  const textiles = entry('4', ['leather'], { sector: 'textiles' });
  assert.deepEqual(requestsForSeller(textiles, open).map((r) => r.jobId), ['0xtextiles'], 'the sector fits when no word does');
  assert.deepEqual(requestsForSeller({ ...shoes, example: true }, open), []);
});

test('the live index is built from the wallets and profiles once, and one save refreshes one entry', async () => {
  sellerIndex.reset();
  const profiles = new Map<string, UserProfile>([
    [agents('a').userAddress, profile({})],
    [agents('b').userAddress, profile({ seller: { ...profile({}).seller!, keywords: ['logo'], skills: ['logo'] } })],
  ]);
  const deps = {
    listWallets: async () => [agents('a'), agents('b'), agents('c')],
    wallets: async (a: string) => [agents('a'), agents('b')].find((w) => w.userAddress === a) ?? null,
    profile: async (a: string) => profiles.get(a) ?? null,
  };
  assert.equal(await sellerIndex.rebuild(deps), 2, 'a wallet without a profile is not a seller');
  assert.equal(sellerIndex.isBuilt(), true);
  profiles.set(agents('b').userAddress, profile({ seller: { ...profile({}).seller!, keywords: ['wigs'], skills: ['wigs'] } }));
  const refreshed = await sellerIndex.refresh(agents('b').userAddress, deps);
  assert.deepEqual(refreshed?.words, ['wigs']);
  assert.deepEqual(sellerIndex.get(agents('b').userAddress)?.words, ['wigs']);
  profiles.delete(agents('a').userAddress);
  assert.equal(await sellerIndex.refresh(agents('a').userAddress, deps), null);
  assert.equal(sellerIndex.entries().length, 1);
  sellerIndex.reset();
});

/// Matching by meaning (view 95 phase 2): a scorer joins sellers and requests
/// that share no word, always after the ones that do.

test('an entry carries the text its meaning vector is made from: the words, then the bio', () => {
  assert.equal(indexEntry(agents('a'), profile({}))?.text, 'shoes. footwear. Clark shoes');
});

test('a meaning-only seller joins after the word matches, best meaning first, and leaves the judge list', () => {
  const index = [entry('1', ['shoes']), entry('2', ['tailor']), entry('3', ['dressmaker']), entry('4', ['photography'])];
  const request = { jobId: '0xj', keywords: ['shoes'] };
  const meaning = (user: string) => ({ [entry('2', []).userAddress]: 40, [entry('3', []).userAddress]: 70 })[user] ?? 0;
  const { byWords, toJudge } = rankSellers(index, request, undefined, meaning);
  assert.deepEqual(byWords.map((s) => s.userAddress[2]), ['1', '3', '2']);
  assert.deepEqual(toJudge.map((s) => s.userAddress[2]), ['4']);
});

test('without a scorer, or with one that scores nobody, the result is the same as today', () => {
  const index = [entry('1', ['shoes', 'sandals']), entry('2', ['logo']), entry('4', ['leather'], { sector: 'textiles' })];
  const request = { jobId: '0xj', keywords: ['shoes'], sourcingSector: 'textiles' };
  assert.deepEqual(rankSellers(index, request, 2, () => 0), rankSellers(index, request, 2));
  assert.deepEqual(rankSellers(index, request, 2, undefined), rankSellers(index, request, 2));
});

test('a meaning-only request joins after the word matches', () => {
  const open = [
    { jobId: '0xshoes', keywords: ['shoes'] },
    { jobId: '0xwedding', keywords: ['aso ebi', 'wedding'] },
    { jobId: '0xlogo', keywords: ['logo'] },
  ];
  const shoes = entry('1', ['shoes', 'tailor']);
  assert.deepEqual(requestsForSeller(shoes, open, undefined, (id) => (id === '0xwedding' ? 55 : 0)).map((r) => r.jobId), ['0xshoes', '0xwedding']);
  assert.deepEqual(requestsForSeller(shoes, open, undefined, () => 0), requestsForSeller(shoes, open));
});

test('listeners hear a rebuild with every entry and a refresh with the one entry', async () => {
  sellerIndex.reset();
  const heard: string[] = [];
  const stop = sellerIndex.listen((entries, how) => heard.push(`${how}:${entries.length}`));
  const deps = {
    listWallets: async () => [agents('a'), agents('b')],
    wallets: async (a: string) => [agents('a'), agents('b')].find((w) => w.userAddress === a) ?? null,
    profile: async () => profile({}),
  };
  await sellerIndex.rebuild(deps);
  await sellerIndex.refresh(agents('a').userAddress, deps);
  stop();
  await sellerIndex.refresh(agents('a').userAddress, deps);
  assert.deepEqual(heard, ['rebuild:2', 'refresh:1']);
  sellerIndex.reset();
});

test('sellers close only in meaning share the judge limit, so a request never costs more model calls than today', () => {
  const index = [entry('1', ['shoes']), entry('2', ['tailor']), entry('3', ['dressmaker']), entry('4', ['seamstress']), entry('5', ['photography']), entry('6', ['plumbing'])];
  const close: Record<string, number> = { [entry('2', []).userAddress]: 50, [entry('3', []).userAddress]: 70, [entry('4', []).userAddress]: 60 };
  const got = rankSellers(index, { jobId: '0xj', keywords: ['shoes'] }, 2, (u) => close[u] ?? 0);
  assert.deepEqual(got.byWords.map((s) => s.userAddress[2]), ['1', '3', '4']);
  assert.deepEqual(got.toJudge, []);
  assert.equal(got.skipped, 3);
  const roomy = rankSellers(index, { jobId: '0xj', keywords: ['shoes'] }, 4, (u) => close[u] ?? 0);
  assert.deepEqual(roomy.byWords.map((s) => s.userAddress[2]), ['1', '3', '4', '2']);
  assert.equal(roomy.toJudge.length, 1);
  assert.equal(roomy.skipped, 1);
});
