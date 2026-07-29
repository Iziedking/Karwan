import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// The sweep has to resume across processes.
///
/// This exists because it did not. `rebuildLifetimeStats` read a module-level
/// accumulator and never loaded the stored one, so a fresh process restarted
/// from the earliest deploy block and overwrote the snapshot with a partial.
/// The failure is invisible from the outside: the numbers still climb, the run
/// just never finishes and every attempt throws away the last one. The seed is
/// ~2,465 windows, so a sweep that cannot resume is a sweep that cannot
/// complete under any timeout.
///
/// A separate store path per test, because the real snapshot on a developer
/// machine holds a part-finished sweep and a test that read it would pass or
/// fail depending on how far that had got.
///
///   npx tsx --test src/chain/lifetimeResume.test.ts

const STORE = join(mkdtempSync(join(tmpdir(), 'karwan-lifetime-')), 'snapshot.json');
process.env.LIFETIME_STORE_PATH = STORE;

const lifetime = await import('./lifetimeStats.js');
const { DEPLOY_LEDGER } = await import('./deployLedger.js');

const ESCROW = DEPLOY_LEDGER.find((c) => c.name === 'KarwanEscrow')!;
const EARLIEST = DEPLOY_LEDGER.reduce(
  (min, c) => (c.deployBlock < min ? c.deployBlock : min),
  DEPLOY_LEDGER[0]!.deployBlock,
).toString();

function writeSnapshot(cursor: string) {
  const row = lifetime.emptyContract(ESCROW);
  row.events = 259;
  lifetime.fold(row, 'EscrowFunded', { dealAmount: 1_000_000n });
  const acc = {
    cursor,
    perContract: { [ESCROW.address]: row },
    transactions: 161,
    scannedAt: 1,
  };
  writeFileSync(
    STORE,
    JSON.stringify({
      acc,
      snapshot: { value: lifetime.projectFromAcc(acc, BigInt(cursor)), builtAt: Date.now() },
    }),
    'utf8',
  );
}

test('a fresh process resumes from the stored cursor, not from day one', async () => {
  const partway = '43811871';
  writeSnapshot(partway);
  lifetime.__resetLifetimeStatsForTest({ allowHydrate: true });

  const resumePoint = await lifetime.__resumePointForTest();

  assert.equal(resumePoint, partway);
  assert.notEqual(
    resumePoint,
    EARLIEST,
    'restarting at the earliest deploy block throws away the whole sweep',
  );
});

test('the work already counted survives the resume', async () => {
  writeSnapshot('43811871');
  lifetime.__resetLifetimeStatsForTest({ allowHydrate: true });

  const stats = await lifetime.getLifetimeStats();

  // If a resume restarted the accumulator instead of adopting it, these would
  // be zero and the next sweep would recount blocks it had already folded in.
  assert.ok(stats, 'nothing hydrated');
  assert.equal(stats.totals.transactions, 161);
  assert.equal(stats.totals.events, 259);
  assert.equal(stats.volumes.fundedUsdc, '1');
});

test('a corrupt snapshot is refused rather than half adopted', async () => {
  // Half-loading is worse than not loading: a cursor without its counts would
  // skip every block below it AND report nothing for them.
  writeFileSync(STORE, '{"acc":{"cursor":"43811871"}}', 'utf8');
  lifetime.__resetLifetimeStatsForTest({ allowHydrate: true });

  assert.equal(await lifetime.__resumePointForTest(), null);
  assert.equal(await lifetime.getLifetimeStats(), null);
});

test('the snapshot on disk keeps the cursor as a plain string', async () => {
  // bigints do not survive JSON.stringify. If a cursor ever became one, every
  // persist would throw and the sweep would silently stop checkpointing.
  writeSnapshot('43811871');
  const raw = JSON.parse(readFileSync(STORE, 'utf8')) as { acc: { cursor: unknown } };
  assert.equal(typeof raw.acc.cursor, 'string');
});
