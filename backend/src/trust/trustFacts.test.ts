import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { partyFactsFrom } from './trustFacts.js';

const ME = '0xaa';
const deal = (over: Partial<DirectDeal>): DirectDeal => ({ buyer: ME, seller: '0xbb', createdAt: 1, ...over }) as DirectDeal;

test('a World ID pass from outside deals counts, with its time', () => {
  const f = partyFactsFrom(ME, [], null, 0, 1000, [400, 700]);
  assert.equal(f.worldIdPassed, true);
  assert.equal(f.worldIdPassedAt, 700);
});

test('a pass on an earlier deal counts with the time it was verified', () => {
  const f = partyFactsFrom(
    ME,
    [deal({ highSignalVerification: { subject: 'buyer', buyer: { status: 'verified', verifiedAt: 500 } } as DirectDeal['highSignalVerification'] })],
    null,
    0,
    1000,
  );
  assert.equal(f.worldIdPassed, true);
  assert.equal(f.worldIdPassedAt, 500);
});

test('no pass anywhere leaves both unset', () => {
  const f = partyFactsFrom(ME, [deal({})], null, 0, 1000);
  assert.equal(f.worldIdPassed, false);
  assert.equal(f.worldIdPassedAt, null);
});
