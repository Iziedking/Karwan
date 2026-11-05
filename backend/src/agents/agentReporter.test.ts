import assert from 'node:assert/strict';
import test from 'node:test';

delete process.env.DATABASE_URL;
const { bus } = await import('../events.js');
const { updateAgentRecord } = await import('../db/agentRecords.js');
const { sendWeeklyLines } = await import('./agentReporter.js');

/// The weekly line says what one check costs and what is left in the data
/// balance (owner, 5 Nov 2026).
///
///   npx tsx --test src/agents/agentReporter.test.ts

test('the weekly line carries the price of a check and the data balance left', async () => {
  const now = Date.UTC(2026, 10, 5);
  await updateAgentRecord('0xowner-weekly', (r) => ({ ...r, spend: [{ at: now - 1000, usd: 0.005, kind: 'record' }, { at: now - 500, usd: 0.005, kind: 'record' }] }));
  const seen: Array<Record<string, unknown>> = [];
  const stop = bus.subscribe((e) => { if (e.type === 'agent.weekly') seen.push(e.payload ?? {}); });
  await sendWeeklyLines(now, async () => 0.084, noFacts);
  stop();
  const mine = seen.find((p) => p.user === '0xowner-weekly');
  assert.ok(mine);
  assert.equal(mine.recordChecks, 2);
  assert.equal(mine.checkPriceUsdc, 0.005);
  assert.equal(mine.dataBalanceUsdc, 0.084);
});

test('a data balance that cannot be read is left out, not shown as zero', async () => {
  const now = Date.UTC(2026, 10, 5);
  await updateAgentRecord('0xowner-unread', (r) => ({ ...r, spend: [{ at: now - 1000, usd: 0.005, kind: 'record' }] }));
  const seen: Array<Record<string, unknown>> = [];
  const stop = bus.subscribe((e) => { if (e.type === 'agent.weekly') seen.push(e.payload ?? {}); });
  await sendWeeklyLines(now, async () => null, noFacts);
  stop();
  const mine = seen.find((p) => p.user === '0xowner-unread');
  assert.ok(mine);
  assert.equal('dataBalanceUsdc' in mine, false);
});

const noFacts = async () => ({ network: 'mainnet' as const, openRequests: [], priceMisses7d: [], lowestPriceUsdc: null, bands: {}, usualDays: {}, sent: [] });

test('the weekly message carries up to three insights and remembers what it told (view 52, step 1)', async () => {
  const now = Date.UTC(2026, 10, 12);
  const owner = '0xowner-insights';
  await updateAgentRecord(owner, (r) => ({ ...r, spend: [{ at: now - 1000, usd: 0.005, kind: 'record' }] }));
  const facts = async () => ({
    ...(await noFacts()),
    bands: { tech: { low: 40, mid: 50, high: 65, deals: 4 } },
    openRequests: [{ jobId: '0xreq', title: 'A landing page', category: 'tech' as const, budgetUsdc: 25, deadlineDays: 5, postedAt: now - 1000, offers: 1 }],
  });
  const seen: Array<Record<string, unknown>> = [];
  const stop = bus.subscribe((e) => { if (e.type === 'agent.weekly' && e.payload?.user === owner) seen.push(e.payload ?? {}); });
  await sendWeeklyLines(now, async () => null, facts);
  stop();
  const insights = seen[0]?.insights as Array<{ kind: string; numbers: Record<string, number>; action: { kind: string } }>;
  assert.equal(insights.length, 1);
  assert.equal(insights[0]!.kind, 'budget-below-band');
  assert.equal(insights[0]!.action.kind, 'set-request-budget');
  const { getAgentRecord } = await import('../db/agentRecords.js');
  assert.deepEqual((await getAgentRecord(owner))?.insightsSent?.map((s) => s.key), ['budget-below-band|0xreq']);
});

test('insights alone are enough for the weekly message; nothing spent and nothing to tell sends nothing', async () => {
  const now = Date.UTC(2026, 10, 12);
  await updateAgentRecord('0xowner-quiet', (r) => ({ ...r, spend: [] }));
  await updateAgentRecord('0xowner-tip', (r) => ({ ...r, spend: [] }));
  const facts = async (owner: string) => owner === '0xowner-tip'
    ? { ...(await noFacts()), lowestPriceUsdc: 40, priceMisses7d: [{ jobId: '0x1', budgetUsdc: 20 }, { jobId: '0x2', budgetUsdc: 25 }, { jobId: '0x3', budgetUsdc: 30 }] }
    : noFacts();
  const seen: string[] = [];
  const stop = bus.subscribe((e) => { if (e.type === 'agent.weekly') seen.push(String(e.payload?.user)); });
  await sendWeeklyLines(now, async () => null, facts);
  stop();
  assert.ok(seen.includes('0xowner-tip'));
  assert.ok(!seen.includes('0xowner-quiet'));
});

test('when the facts cannot be read, the spend line still goes out', async () => {
  const now = Date.UTC(2026, 10, 19);
  await updateAgentRecord('0xowner-facts-down', (r) => ({ ...r, spend: [{ at: now - 1000, usd: 0.005, kind: 'record' }] }));
  const seen: Array<Record<string, unknown>> = [];
  const stop = bus.subscribe((e) => { if (e.type === 'agent.weekly' && e.payload?.user === '0xowner-facts-down') seen.push(e.payload ?? {}); });
  await sendWeeklyLines(now, async () => null, async () => { throw new Error('market store down'); });
  stop();
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.insights, undefined);
});

test('the weekly message counts the questions asked, answered and decided by default (view 52, step 2)', async () => {
  const now = Date.UTC(2026, 10, 26);
  await updateAgentRecord('0xowner-asked', (r) => ({ ...r, spend: [] }));
  const seen: Array<Record<string, unknown>> = [];
  const stop = bus.subscribe((e) => { if (e.type === 'agent.weekly' && e.payload?.user === '0xowner-asked') seen.push(e.payload ?? {}); });
  await sendWeeklyLines(now, async () => null, noFacts, async () => ({ asked: 4, answered: 1, byDefault: 3 }));
  stop();
  assert.deepEqual(seen[0]?.questions, { asked: 4, answered: 1, byDefault: 3 });
});
