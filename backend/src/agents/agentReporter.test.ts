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
  await sendWeeklyLines(now, async () => 0.084);
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
  await sendWeeklyLines(now, async () => null);
  stop();
  const mine = seen.find((p) => p.user === '0xowner-unread');
  assert.ok(mine);
  assert.equal('dataBalanceUsdc' in mine, false);
});
