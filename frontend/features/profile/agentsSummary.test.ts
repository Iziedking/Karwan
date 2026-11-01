import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../app/profile/page.tsx', import.meta.url), 'utf8');
const panel = page.slice(page.indexOf("key: 'identity'"), page.indexOf("key: 'wallets'"));
const agent = readFileSync(new URL('../agent/YourAgent.tsx', import.meta.url), 'utf8');

/// Your agent (view 45) replaced the Agent workspace's groups, links and hint.

test('the Your agent section is the one page, not groups that edit elsewhere', () => {
  assert.match(panel, /<YourAgent/);
  assert.doesNotMatch(panel, /waySummary|editLink|waysLink|ReputationSources|TierCelebration|meChange/);
});

test('five questions, selling first, then what it does alone, then buying', () => {
  const order = ['t.rows.sell', 't.rows.price', 't.rows.paid', 't.rows.alone', 't.rows.buy'].map((k) => agent.indexOf(`answer(${k}`));
  for (const at of order) assert.ok(at > 0, 'every row is there');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('the full editor is one link away, and the assistant is offered beside it', () => {
  assert.match(agent, /<Row label=\{t\.moreWays\} href="\/profile\/ways" \/>/);
  assert.match(agent, /router\.push\('\/assistant'\)/);
});
