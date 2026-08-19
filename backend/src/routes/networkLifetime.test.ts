import { test } from 'node:test';
import assert from 'node:assert/strict';

/// The all-time route's contract with the page that renders it.
///
/// Two things matter here and neither is arithmetic. First, a deployment whose
/// seed scan has not run must say so with a 503 rather than 200-with-zeros: the
/// page tells those apart and shows "not scanned yet" instead of claiming the
/// platform has never done anything. Second, every USDC figure has to leave as
/// a decimal string, because JSON numbers cannot carry these amounts without
/// precision loss.
///
///   npx tsx --test src/routes/networkLifetime.test.ts

const { networkRoutes } = await import('./network.js');
const lifetime = await import('../chain/lifetimeStats.js');
const { DEPLOY_LEDGER } = await import('../chain/deployLedger.js');

const ESCROW = DEPLOY_LEDGER.find((c) => c.name === 'KarwanEscrow')!;

function get(path: string) {
  return networkRoutes.request(new Request(`http://local${path}`));
}

test('a deployment that has never been scanned says so, and does not report zeros', async () => {
  lifetime.__resetLifetimeStatsForTest();

  const res = await get('/lifetime');
  const body = (await res.json()) as { error?: string; totals?: unknown };

  assert.equal(res.status, 503, 'an unscanned deployment must not answer 200');
  // 200-with-zeros would render as "Karwan has settled 0.00 USDC across 0
  // deals", which is a false claim rather than a missing snapshot.
  assert.equal(body.totals, undefined);
  assert.match(String(body.error), /not scanned/i);
});

test('a scanned deployment serves the totals, with USDC as strings', async () => {
  const row = lifetime.emptyContract(ESCROW);
  lifetime.fold(row, 'EscrowFunded', { dealAmount: 1_234_560_000n });
  row.events = 4;

  const acc = {
    // Stamped, or the route refuses the fixture the same way it refuses a
    // snapshot built before a contract was added to the ledger.
    ledgerFingerprint: lifetime.LEDGER_FINGERPRINT,
    cursor: '54000000',
    perContract: { [ESCROW.address]: row },
    transactions: 3,
    scannedAt: 1,
  };
  lifetime.__setLifetimeStatsForTest({
    acc,
    snapshot: { value: lifetime.projectFromAcc(acc, 54_000_000n), builtAt: Date.now() },
  });

  const res = await get('/lifetime');
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    volumes: { fundedUsdc: unknown };
    totals: { transactions: number; deals: number };
    contracts: Array<{ address: string; fundedUsdc: unknown }>;
  };

  // A string, not a number. 1234.56 survives either way; a large total does
  // not, and the format must not depend on the size of the number.
  assert.equal(typeof body.volumes.fundedUsdc, 'string');
  assert.equal(body.volumes.fundedUsdc, '1234.56');
  assert.equal(body.totals.transactions, 3);
  assert.equal(body.totals.deals, 1);

  const contract = body.contracts.find((c) => c.address === ESCROW.address);
  assert.ok(contract, 'the contract breakdown is missing the escrow');
  assert.equal(contract.fundedUsdc, '1234.56', 'breakdown disagrees with the total');
});

test('the route is public, and exposes no per-user detail', async () => {
  // Deliberately not sign-in gated, unlike /activity: these are sums and the
  // addresses they came from. If a field ever appears here that names a
  // counterparty or a deal, that decision has to be made on purpose.
  const acc = {
    // Stamped, or the route refuses the fixture the same way it refuses a
    // snapshot built before a contract was added to the ledger.
    ledgerFingerprint: lifetime.LEDGER_FINGERPRINT,
    cursor: '54000000',
    perContract: { [ESCROW.address]: lifetime.emptyContract(ESCROW) },
    transactions: 0,
    scannedAt: 1,
  };
  lifetime.__setLifetimeStatsForTest({
    acc,
    snapshot: { value: lifetime.projectFromAcc(acc, 54_000_000n), builtAt: Date.now() },
  });

  const res = await get('/lifetime');
  assert.equal(res.status, 200);

  const text = await res.text();
  for (const leak of ['jobId', 'buyer', 'seller', 'wallet', 'email']) {
    assert.equal(text.includes(leak), false, `the payload mentions ${leak}`);
  }
});
