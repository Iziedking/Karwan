import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { afterRefusal, mayLock, type LockFacts, type LockRefusal } from './autopilotGate.js';

/// The gate for locking money alone (view 87).
///
///   node ../scripts/run-tests.mjs src/agents/autopilotGate.test.ts

const USDC = 1_000_000n;

const passing = (): LockFacts => ({
  serverOn: true,
  agentOn: true,
  switches: { lock: true },
  stopped: false,
  family: true,
  rules: { perDealMicros: 50n * USDC, perWeekMicros: 150n * USDC, perDay: 3, who: 'record' },
  totalMicros: 42n * USDC,
  lockedThisWeekMicros: 60n * USDC,
  locksToday: 1,
  seller: { verified: false, settledDeals: 4, upheldDisputes: 0 },
  agreedMicros: 41n * USDC,
  marketMicros: 40n * USDC,
  outlierPct: 40,
});

const refused = (change: Partial<LockFacts>, reason: LockRefusal) =>
  assert.deepEqual(mayLock({ ...passing(), ...change }), { ok: false, reason });

test('every fact must pass', () => {
  assert.deepEqual(mayLock(passing()), { ok: true });
});

test('the server switch, the agent switch and the lock switch each stop it', () => {
  refused({ serverOn: false }, 'server-off');
  refused({ agentOn: false }, 'agent-off');
  refused({ switches: { lock: false } }, 'switch-off');
});

test('lock on with no rules saved is not on', () => {
  refused({ rules: null }, 'switch-off');
});

test('an agent that stopped itself locks nothing', () => {
  refused({ stopped: true }, 'stopped');
});

test('only a deal on the escrow family', () => {
  refused({ family: false }, 'not-family');
});

test('the most for one deal counts the fees, to the unit', () => {
  assert.deepEqual(mayLock({ ...passing(), totalMicros: 50n * USDC }), { ok: true });
  refused({ totalMicros: 50n * USDC + 1n }, 'over-deal');
  refused({ totalMicros: 0n }, 'over-deal');
  refused({ totalMicros: -1n }, 'over-deal');
});

test('the most in a week counts what is already locked', () => {
  assert.deepEqual(mayLock({ ...passing(), lockedThisWeekMicros: 108n * USDC }), { ok: true });
  refused({ lockedThisWeekMicros: 108n * USDC + 1n }, 'over-week');
});

test('the locks in a day', () => {
  assert.deepEqual(mayLock({ ...passing(), locksToday: 2 }), { ok: true });
  refused({ locksToday: 3 }, 'over-day');
});

test('who it may deal with', () => {
  const none = { verified: false, settledDeals: 0, upheldDisputes: 0 };
  refused({ seller: none }, 'who');
  refused({ seller: { verified: false, settledDeals: 9, upheldDisputes: 1 } }, 'who');
  assert.deepEqual(mayLock({ ...passing(), seller: { verified: true, settledDeals: 0, upheldDisputes: 0 } }), { ok: true });

  const verifiedOnly = { ...passing().rules!, who: 'verified' as const };
  refused({ rules: verifiedOnly }, 'who');
  assert.deepEqual(mayLock({ ...passing(), rules: verifiedOnly, seller: { verified: true, settledDeals: 0, upheldDisputes: 0 } }), { ok: true });

  assert.deepEqual(mayLock({ ...passing(), rules: { ...passing().rules!, who: 'anyone' }, seller: none }), { ok: true });
});

test('a price far above the market goes to the person', () => {
  assert.deepEqual(mayLock({ ...passing(), agreedMicros: 56n * USDC, totalMicros: 50n * USDC }), { ok: true });
  refused({ agreedMicros: 56n * USDC + 1n }, 'price-outlier');
});

test('with no market price the outlier rule does not apply', () => {
  assert.deepEqual(mayLock({ ...passing(), marketMicros: null, agreedMicros: 49n * USDC }), { ok: true });
  assert.deepEqual(mayLock({ ...passing(), marketMicros: 0n, agreedMicros: 49n * USDC }), { ok: true });
});

test('the first failing fact is the reason', () => {
  refused({ serverOn: false, agentOn: false, family: false }, 'server-off');
  refused({ switches: { lock: false }, stopped: true }, 'switch-off');
  refused({ family: false, totalMicros: 999n * USDC }, 'not-family');
  refused({ totalMicros: 999n * USDC, locksToday: 9 }, 'over-deal');
  refused({ locksToday: 9, seller: { verified: false, settledDeals: 0, upheldDisputes: 0 } }, 'over-day');
});

test('a deal off the family or a day\'s locks used stops the agent; the rest is asked', () => {
  assert.equal(afterRefusal('not-family'), 'stop');
  assert.equal(afterRefusal('over-day'), 'stop');
  assert.equal(afterRefusal('over-day', false), 'stop');
  assert.equal(afterRefusal('not-family', false), 'ask', 'the family switched off here is a question');
  for (const r of ['server-off', 'agent-off', 'switch-off', 'stopped', 'over-deal', 'over-week', 'who', 'price-outlier'] as LockRefusal[]) {
    assert.equal(afterRefusal(r), 'ask');
  }
});

test('only the lock step and its facts read the gate: nothing else may decide a lock', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..');
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.') && !entry.name.startsWith('autopilotGate.') && readFileSync(path, 'utf8').includes("autopilotGate.js'")) hits.push(entry.name);
    }
  };
  walk(src);
  assert.deepEqual(hits.sort(), ['lockAlone.ts', 'lockFacts.ts']);
});
