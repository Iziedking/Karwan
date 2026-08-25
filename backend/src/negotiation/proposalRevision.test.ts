import assert from 'node:assert/strict';
import test from 'node:test';
import type { MatchProposal } from '../db/matchProposals.js';
import {
  InMemoryMatchProposalRevisionStore,
  matchProposalFingerprint,
} from './proposalRevision.js';

function proposal(overrides: Partial<MatchProposal> = {}): MatchProposal {
  return {
    jobId: '0xJOB',
    buyerUser: '0xBUYER',
    buyerAgent: '0xBAGENT',
    sellerUser: '0xSELLER',
    sellerAgent: '0xSAGENT',
    agreedPriceUsdc: '100.000000',
    deadlineUnix: 1_800_000_000,
    termsHash: 'terms-v1',
    proposedAt: 1_700_000_000,
    ...overrides,
  };
}

test('proposal fingerprint is stable across address casing and object key order', () => {
  const first = proposal({
    counterpartyBusiness: { accountType: 'business', companyName: 'Acme', region: 'NG' },
  });
  const second = {
    ...proposal(),
    buyerUser: '0xbUyEr',
    counterpartyBusiness: { region: 'NG', companyName: 'Acme', accountType: 'business' as const },
  };
  assert.equal(matchProposalFingerprint(first), matchProposalFingerprint(second));
  assert.notEqual(matchProposalFingerprint(first), matchProposalFingerprint({
    ...second,
    counterpartyBusiness: { ...second.counterpartyBusiness, companyName: 'Other' },
  }));
});

test('revision store is idempotent and creates immutable per-job revisions', async () => {
  const store = new InMemoryMatchProposalRevisionStore();
  const first = await store.observe({ proposal: proposal(), observedAt: 1_700_000_001 });
  assert.equal(first.created, true);
  assert.equal(first.record.revision, 1);
  assert.equal(first.record.id, 'proposal-revision:0xjob:1');

  const replay = await store.observe({
    proposal: { ...proposal(), buyerUser: '0xbUyEr' },
    observedAt: 1_700_000_002,
  });
  assert.equal(replay.created, false);
  assert.equal(replay.record.revision, 1);

  const second = await store.observe({
    proposal: { ...proposal(), agreedPriceUsdc: '105.000000', raisedPriceUsdc: '105.000000' },
    observedAt: 1_700_000_003,
  });
  assert.equal(second.created, true);
  assert.equal(second.record.revision, 2);

  const history = await store.list('0xJOB');
  assert.deepEqual(history.map((record) => record.revision), [2, 1]);
  const fetched = await store.get('0xjob', 1);
  assert.equal(fetched?.proposal.agreedPriceUsdc, '100.000000');
  assert.notStrictEqual(fetched?.proposal, first.record.proposal);
});

test('revision store rejects malformed observation timestamps and proposals', async () => {
  const store = new InMemoryMatchProposalRevisionStore();
  await assert.rejects(
    () => store.observe({ proposal: proposal(), observedAt: -1 }),
    /timestamp/,
  );
  await assert.rejects(
    () => store.observe({ proposal: { ...proposal(), buyerAgent: '' }, observedAt: 1 }),
    /buyerAgent/,
  );
});
