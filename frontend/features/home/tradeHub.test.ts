import assert from 'node:assert/strict';
import test from 'node:test';
import { tradeHubSummary } from './tradeHub';

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
