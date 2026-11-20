import assert from 'node:assert/strict';
import test from 'node:test';
import { rankSellers, requestsForSeller, type IndexedSeller } from '../matching/sellerIndex.js';
import { offersThatFit, type FitOffer } from '../marketplace/offersThatFit.js';
import { rankForFind, type FindCandidate, type FindNeed } from './rank.js';

/// Every path that matches words finds a tailor for a fashion designer, with no
/// model (view 95). Find from the assistant, Telegram and MCP reads people
/// through rankSellers (directoryLive) and ranks them with rankForFind.
///
///   npx tsx --test src/find/foundByMeaning.test.ts

const entry = (n: string, words: string[]): IndexedSeller => ({
  userAddress: `0x${n.repeat(40)}`,
  sellerAddress: `0x${n.repeat(39)}5`,
  words,
  sector: null,
  shapes: ['one_time'],
  country: null,
  example: false,
  onMarket: true,
  updatedAt: 1,
});

test('a fashion designer request reaches the tailor by words, ahead of a graphic designer', () => {
  // The graphic designer still shares the written word "designer", as before the map;
  // the tailor now shares both words through tailoring, so comes first.
  const tailor = entry('a', ['tailor', 'native wears']);
  const graphic = entry('b', ['graphic designer', 'logos']);
  const got = rankSellers([graphic, tailor], { jobId: 'j1', keywords: ['fashion designer'], briefText: 'Fashion Designer for my clothes' });
  assert.equal(got.byWords[0]?.userAddress, tailor.userAddress);
});

test('a tailor sees the fashion designer request among the requests they fit', () => {
  const tailor = entry('a', ['tailor']);
  const got = requestsForSeller(tailor, [
    { jobId: 'logo', keywords: ['logo design'] },
    { jobId: 'dress', keywords: ['fashion designer'] },
  ]);
  assert.deepEqual(got.map((r) => r.jobId), ['dress']);
});

test('find ranks a tailor for a fashion designer need', () => {
  const need: FindNeed = {
    text: 'Fashion designer for my clothes', keywords: ['fashion', 'designer'], budgetUsdc: 70, kind: 'remote', where: { scope: 'anywhere' },
    buyer: '0xbuyer', buyerLocation: null, buyerVerified: false,
  };
  const tailor: FindCandidate = {
    user: '0xtailor', sellerAgent: '0xtailor-agent', name: 'Ada', tag: 'ada', words: ['tailor', 'native wears'],
    meet: { atMyPlace: false, comeToYouKm: null, online: true }, location: null,
    verified: false, tier: 'ESTABLISHED', rating: { kind: 'rated', value: 4.5, count: 6, disputed: 0 },
    price: { min: 40, usual: 60 }, days: { min: 2, max: 5 }, onTimeRate: null, completed: 3, disputesLost: 0, contactFrom: 'anyone', outsideAgents: true,
  };
  const rows = rankForFind([tailor], need, { requireVerified: false, blocked: new Set(), cleanRecordCounts: false });
  assert.deepEqual(rows.map((r) => r.user), ['0xtailor']);
});

test('a tailoring offer fits a request for a fashion designer', () => {
  const NOW = 1_800_000_000_000;
  const offer: FitOffer = {
    id: 'o1', title: 'Tailoring', description: 'Native and English wears', askingPriceUsdc: 50,
    sellerUser: '0x' + '1'.repeat(40), expiresAt: NOW + 86_400_000,
  };
  const fit = offersThatFit({ brief: 'Fashion designer for my clothes', budgetUsdc: 70, buyer: '0x' + 'b'.repeat(40), now: NOW }, [offer]);
  assert.equal(fit.count, 1);
});
