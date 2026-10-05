import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The near-miss and out-of-reach stores write under <cwd>/data; keep them out of the repo.
process.chdir(mkdtempSync(join(tmpdir(), 'nearmiss-')));

const { maybeRaiseNearMiss, setInBudgetProbe } = await import('./nearMiss.js');
const { markPassed } = await import('../db/outOfReach.js');
const { bus } = await import('../events.js');

const JOB = '0x' + '1'.repeat(64);
const BUYER = '0x' + 'b'.repeat(40);
const SELLER = '0x' + 'c'.repeat(40);
const OTHER = '0x' + 'd'.repeat(40);

function skips(jobId: string): Array<Record<string, unknown>> {
  const seen: Array<Record<string, unknown>> = [];
  bus.on('event', (e: { type: string; jobId?: string; payload?: Record<string, unknown> }) => {
    if (e.type === 'negotiation.near-miss.skipped' && e.jobId === jobId) seen.push(e.payload ?? {});
  });
  return seen;
}

const base = {
  jobId: JOB,
  buyerAgent: BUYER,
  sellerAgent: SELLER,
  deadlineUnix: Math.floor(Date.now() / 1000) + 86_400,
  buyerCeilingUsdc: 300,
  sellerFloorUsdc: 486,
  confirmedTopical: true,
};

test('an over-budget ask is not raised while the request has a live offer within budget', async () => {
  const seen = skips(JOB);
  setInBudgetProbe((jobId, ceiling, exclude) =>
    jobId === JOB && ceiling >= 200 && exclude.toLowerCase() !== OTHER ? { seller: OTHER, priceUsdc: 200 } : null,
  );
  const raised = await maybeRaiseNearMiss(base);
  assert.equal(raised, false);
  assert.equal(seen.at(-1)?.reason, 'in-budget-alternative');
  setInBudgetProbe(null);
});

test('the same seller is not raised again at the price the buyer already passed', async () => {
  const job = '0x' + '2'.repeat(64);
  const seen = skips(job);
  markPassed(job, {
    jobId: job, buyerUser: BUYER, buyerAgent: BUYER, sellerUser: SELLER, sellerAgent: SELLER,
    askedSide: 'buyer', askedUser: BUYER, proceedPriceUsdc: '486.00', limitUsdc: '300.00', gapUsdc: '186.00',
    buyerCeilingUsdc: '300.00', sellerFloorUsdc: '486.00', createdAt: Date.now(), expiresAt: Date.now() + 1000,
  });
  const raised = await maybeRaiseNearMiss({ ...base, jobId: job });
  assert.equal(raised, false);
  assert.equal(seen.at(-1)?.reason, 'already-passed');
});
