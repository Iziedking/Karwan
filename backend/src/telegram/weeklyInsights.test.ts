import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// The weekly message on Telegram: the spend line when something was spent,
/// then what the agent sees (view 52, step 1), and research that failed.
///
///   npx tsx --test src/telegram/weeklyInsights.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-weekly-insights-')));
delete process.env.DATABASE_URL;
const { summaryFor, recipientsFor } = await import('./notifier.js');

const OWNER = '0x00000000000000000000000000000000000000c3';
const insight = { kind: 'missed-by-price', numbers: { count: 13, buyersMedianUsdc: 25, lowestPriceUsdc: 40 }, action: { kind: 'set-lowest-price', priceUsdc: 25 } };

test('insights alone: no spend line, a heading and one bullet per insight', () => {
  const e = { type: 'agent.weekly', actor: 'platform', ts: 0, payload: { user: OWNER, totalUsdc: 0, recordChecks: 0, webSearches: 0, budgetUsdc: 0.25, insights: [insight] } } as never;
  const text = summaryFor(e, 'self')!.text;
  assert.doesNotMatch(text, /spent 0 USDC/);
  assert.match(text, /What your agent sees/);
  assert.match(text, /• You missed 13 requests this week because your lowest price, 40 USDC, was above what buyers offered/);
});

test('spend and insights together keep both', () => {
  const e = { type: 'agent.weekly', actor: 'platform', ts: 0, payload: { user: OWNER, totalUsdc: 0.01, recordChecks: 2, webSearches: 0, budgetUsdc: 0.25, checkPriceUsdc: 0.005, insights: [insight] } } as never;
  const text = summaryFor(e, 'self')!.text;
  assert.match(text, /Your agents spent 0.01 USDC on data this week/);
  assert.match(text, /You missed 13 requests/);
});

test('research that failed reaches its owner only, with the amount when one was spent', async () => {
  const e = { type: 'agent.research.failed', actor: 'seller', ts: 0, payload: { kind: 'research', user: OWNER, ref: '0xreq', title: 'Logo design', amountUsd: 0.009 } } as never;
  assert.deepEqual(await recipientsFor(e), [{ address: OWNER, role: 'self' }]);
  assert.match(summaryFor(e, 'self')!.text, /Research for Logo design didn't finish\*, and 0.009 USDC was spent on it/);
  const platform = { type: 'agent.research.failed', actor: 'platform', ts: 0, payload: { kind: 'research', agent: 'platform', amountUsd: 0.01 } } as never;
  assert.deepEqual(await recipientsFor(platform), []);
});
