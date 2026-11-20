import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { liveOffers, openRequests, tradeHubSummary } from './tradeHub';
import { getProductBackHref } from '../../shared/utils/routes';
import { routeTitleKey } from '../../shared/seo/routeTitle';

const now = 1_000_000_000_000;
const me = '0xme';
const job = (over: Record<string, unknown>) => ({ finalized: false, escrowFunded: false, deadlineUnix: now / 1000 + 3600, bids: [], ...over });
const listing = (over: Record<string, unknown>) => ({ expiresAt: now + 60_000, ...over });

test('active trades leave out settled and cancelled ones and count those waiting on you', () => {
  const summary = tradeHubSummary({
    me,
    trades: [
      { stage: 'awaiting-final-release', isBuyer: true },
      { stage: 'awaiting-delivery', isBuyer: true },
      { stage: 'awaiting-delivery', isBuyer: false },
      { stage: 'settled', isBuyer: true },
      { stage: 'cancelled', isBuyer: false },
    ],
    requests: [],
    listings: [],
    now,
  });
  assert.deepEqual(summary.trades, { active: 3, yourMove: 2 });
});

test('open requests are the ones still looking, with their offers counted', () => {
  const summary = tradeHubSummary({
    me,
    trades: [],
    requests: [
      job({ bids: [{}, {}] }),
      job({}),
      job({ escrowFunded: true, bids: [{}] }),
      job({ cancelledAt: now - 1 }),
      job({ expiredAt: now - 1, bids: [{}] }),
    ] as never,
    listings: [],
    now,
  });
  assert.deepEqual(summary.requests, { open: 2, offers: 2 });
});

test('live offers are the listings not matched, cancelled or past their window', () => {
  const summary = tradeHubSummary({
    me,
    trades: [],
    requests: [],
    listings: [listing({}), listing({ matchedAt: now - 1 }), listing({ cancelledAt: now - 1 }), listing({ expiresAt: now - 1 })] as never,
    now,
  });
  assert.equal(summary.offers.live, 1);
});

test('the lists hold exactly what the cards count, newest first', () => {
  const requests = [
    job({ jobId: 'a', deadlineUnix: now / 1000 + 100 }),
    job({ jobId: 'b', deadlineUnix: now / 1000 + 900, bids: [{}] }),
    job({ jobId: 'c', cancelledAt: now - 1 }),
  ] as never;
  const listings = [
    listing({ id: 'x', postedAt: 1 }),
    listing({ id: 'y', postedAt: 5 }),
    listing({ id: 'z', postedAt: 9, matchedAt: now - 1 }),
    listing({ id: 'w', postedAt: 7, expiresAt: now - 1 }),
  ] as never;
  const summary = tradeHubSummary({ me, trades: [], requests, listings, now });
  assert.deepEqual(openRequests(requests, now).map((j) => j.jobId), ['b', 'a']);
  assert.deepEqual(liveOffers(listings, now).map((l) => l.id), ['y', 'x']);
  assert.equal(summary.requests.open, openRequests(requests, now).length);
  assert.equal(summary.offers.live, liveOffers(listings, now).length);
});

test('each card in Your trades opens its own list, never a form or the whole activity feed', () => {
  const yours = readFileSync(new URL('../market/components/YourTrades.tsx', import.meta.url), 'utf8');
  assert.match(yours, /href="\/deals"/);
  assert.match(yours, /marketViewHref\('yours', 'requests'\)/);
  assert.match(yours, /marketViewHref\('yours', 'offers'\)/);
  assert.doesNotMatch(yours, /\/p2p/);
});

const contest = (status: string, entries = 0) => ({ status, entries }) as never;
const request = (status: string) => ({ status }) as never;
const engagement = (status: string, role: 'hirer' | 'worker') => ({ status, role }) as never;

test('contests count what you posted that is open and what you entered that is not decided (view 96)', () => {
  const summary = tradeHubSummary({
    me, trades: [], requests: [], listings: [], now,
    contests: {
      posted: [contest('open', 4), contest('awarding', 0), contest('awarded', 6)],
      entered: [contest('open'), contest('awarded'), contest('returned')],
    },
  });
  assert.deepEqual(summary.contests, { open: 3, entriesIn: 1, decided: 2 });
});

test('work counts open work you posted or offered on, and work under way; offered to you waits on you (view 96)', () => {
  const summary = tradeHubSummary({
    me, trades: [], requests: [], listings: [], now,
    work: {
      posted: [request('open'), request('hired')],
      offered: [request('open')],
      work: [engagement('active', 'hirer'), engagement('offered', 'worker'), engagement('offered', 'hirer'), engagement('closed', 'worker')],
    },
  });
  assert.deepEqual(summary.work, { open: 5, waiting: 1 });
});

test('without contests or work the counts are zero, so older callers still read', () => {
  const summary = tradeHubSummary({ me, trades: [], requests: [], listings: [], now });
  assert.deepEqual([summary.contests, summary.work], [{ open: 0, entriesIn: 0, decided: 0 }, { open: 0, waiting: 0 }]);
});
