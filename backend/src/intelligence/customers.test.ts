import assert from 'node:assert/strict';
import test from 'node:test';
import { findCustomers } from './customers.js';

/// find_customers (view 48, step 5): who might buy from a seller now.

const DAY = 86_400;
const NOW = 1_800_000_000;
const ME = '0xme';
const r = (jobId: string, briefText: string, extra: Record<string, unknown> = {}) => ({
  jobId, briefText, budgetUsdc: '80', deadlineUnix: NOW + 5 * DAY, postedAt: (NOW - DAY) * 1000, postedBy: '0xbuyer', bidsCount: 1, ...extra,
});

test('requests that already fit, and open ones in the categories the seller serves', () => {
  const out = findCustomers({
    me: ME,
    categories: new Set(['design']),
    requests: [
      r('0xa', 'Logo for my shop'),
      r('0xb', 'Flyer for a church event', { postedAt: NOW * 1000 }),
      r('0xc', 'Build a website'),
      r('0xd', 'My own logo', { postedBy: ME }),
      r('0xe', 'Banner design', { example: true }),
      r('0xf', 'Poster design'),
    ],
    fits: new Set(['0xa']),
    offered: new Set(['0xf']),
    rising: [{ id: 'design', name: 'Design', thisWeek: 3, lastWeek: 1, openOffers: 2, rising: true }],
  });
  assert.deepEqual(out.alreadyFit.map((x) => x.jobId), ['0xa']);
  assert.deepEqual(out.openInYourCategories.map((x) => x.jobId), ['0xb'], 'newest first; own, examples, already offered and fits left out');
  assert.deepEqual(out.rising, ['Design']);
  assert.deepEqual(Object.keys(out.openInYourCategories[0]!).sort(), ['budgetUsdc', 'category', 'jobId', 'neededBy', 'offersSoFar', 'title']);
  assert.equal(JSON.stringify(out).includes('0xbuyer'), false, 'never the buyer');
});

test('a seller with no categories gets only what already fits', () => {
  const out = findCustomers({ me: ME, categories: new Set(), requests: [r('0xa', 'Logo')], fits: new Set(), offered: new Set(), rising: [] });
  assert.deepEqual(out, { alreadyFit: [], openInYourCategories: [], rising: [] });
});
