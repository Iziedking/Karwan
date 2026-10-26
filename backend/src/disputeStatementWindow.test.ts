import assert from 'node:assert/strict';
import test from 'node:test';

/// Inside a dispute each side has 72 hours to give their side; a silent side loses.
delete process.env.DISPUTE_STATEMENT_WINDOW_MS;
const { config } = await import('./config.js');
const { statementWindowOpen } = await import('./deals/disputeJudge.js');

test('each side has 72 hours to give their side of a dispute', () => {
  assert.equal(config.DISPUTE_STATEMENT_WINDOW_MS, 72 * 3_600_000);
  const disputedAt = 1_800_000_000_000;
  const deal = { disputed: true, disputedAt } as Parameters<typeof statementWindowOpen>[0];
  assert.equal(statementWindowOpen(deal, disputedAt + 72 * 3_600_000 - 60_000, config.DISPUTE_STATEMENT_WINDOW_MS), true);
  assert.equal(statementWindowOpen(deal, disputedAt + 72 * 3_600_000 + 1, config.DISPUTE_STATEMENT_WINDOW_MS), false);
});
