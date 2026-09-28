import assert from 'node:assert/strict';
import test from 'node:test';
import { MATCH_CANDIDATE_LIMIT, rankListingCandidates, rankRequestCandidates } from './matchCandidates.js';

const listing = (id: string, title: string, description = '') => ({ id, title, description });

test('a request only reaches the matcher with offers that share a topic word, best overlap first', () => {
  const ranked = rankListingCandidates(
    { keywords: ['logo design', 'brand identity'] },
    [
      listing('a', 'Bookkeeping for small shops', 'Monthly books and tax prep'),
      listing('b', 'Logo design', 'One logo with three revisions'),
      listing('c', 'Brand identity kit', 'Logo, colours and type for a new brand'),
    ],
  );
  assert.deepEqual(ranked.map((l) => l.id), ['c', 'b']);
});

test('without extracted keywords the request text stands in, and the matcher never sees more than the limit', () => {
  const many = Array.from({ length: 60 }, (_, i) => listing(`l${i}`, `Wedding photography package ${i}`));
  const ranked = rankListingCandidates({ keywords: [], briefText: 'Need a wedding photographer in Lagos' }, many);
  assert.equal(ranked.length, MATCH_CANDIDATE_LIMIT);
});

test('a new offer is compared only with open requests that share a topic word', () => {
  const ranked = rankRequestCandidates(listing('x', 'Bookkeeping', 'Monthly bookkeeping for retailers'), [
    { jobId: '1', keywords: ['bookkeeping', 'accounts'] },
    { jobId: '2', keywords: ['video editing'] },
    { jobId: '3', keywords: [], briefText: 'Looking for someone to do monthly bookkeeping' },
  ]);
  assert.deepEqual(ranked.map((j) => j.jobId).sort(), ['1', '3']);
});
