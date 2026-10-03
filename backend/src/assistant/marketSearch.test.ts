import assert from 'node:assert/strict';
import test from 'node:test';
import { searchMarket, searchTerms } from './marketSearch.js';

const offers = [
  { id: 'l1', sellerUser: '0xa', title: 'Logo design, 3 revisions', description: 'Brand marks for small shops', askingPriceUsdc: 150, postedAt: 1 },
  { id: 'l2', sellerUser: '0xb', title: 'Translation EN to AR', description: 'Documents and websites', askingPriceUsdc: 60, postedAt: 2 },
  { id: 'l3', sellerUser: '0xme', title: 'Logo refresh', description: 'My own offer', askingPriceUsdc: 90, postedAt: 3 },
];
const requests = [
  { jobId: '0xj1', briefText: 'Need a logo for my bakery\nSimple and bold', budgetUsdc: '120', deadlineUnix: 1_800_000_000, postedAt: 4 },
  { jobId: '0xj2', briefText: 'Build a landing page', budgetUsdc: '400', deadlineUnix: 1_800_000_000, postedAt: 5 },
];

test('filler words do not count as search terms', () => {
  assert.deepEqual(searchTerms('Find a seller'), []);
  assert.deepEqual(searchTerms('find someone for logo design'), ['logo', 'design']);
});

test('offers matching the words come first and the caller never sees their own', () => {
  const hits = searchMarket({ query: 'logo design', kind: 'offers', excludeSeller: '0xME' }, offers, requests);
  assert.deepEqual(hits.map((h) => (h.kind === 'offer' ? h.id : h.jobId)), ['l1']);
});

test('a plain "find a seller" lists the newest offers', () => {
  const hits = searchMarket({ query: 'Find a seller', kind: 'offers' }, offers, requests);
  assert.deepEqual(hits.map((h) => (h.kind === 'offer' ? h.id : '')), ['l3', 'l2', 'l1']);
});

test('requests are searched by their brief and a price cap applies', () => {
  const hits = searchMarket({ query: 'logo', kind: 'both', maxPriceUsdc: 130 }, offers, requests);
  assert.deepEqual(hits.map((h) => (h.kind === 'offer' ? h.id : h.jobId)).sort(), ['0xj1', 'l3']);
  const request = hits.find((h) => h.kind === 'request');
  assert.equal(request?.kind === 'request' ? request.title : '', 'Need a logo for my bakery');
});

test('every searched word has to match the start of a word, so accounting is not an outlier account', () => {
  const extra = [...offers, { id: 'l4', sellerUser: '0xc', title: 'Accounting software setup for clients', description: 'Bookkeeping', askingPriceUsdc: 110, postedAt: 4 }];
  assert.deepEqual(searchMarket({ query: 'outlier account', kind: 'offers' }, extra, requests), []);
  assert.deepEqual(searchMarket({ query: 'accounting setup', kind: 'offers' }, extra, requests).map((h) => (h.kind === 'offer' ? h.id : '')), ['l4']);
  // A longer search may miss one word.
  assert.deepEqual(searchMarket({ query: 'logo design bakery', kind: 'offers', excludeSeller: '0xme' }, extra, requests).map((h) => (h.kind === 'offer' ? h.id : '')), ['l1']);
});
