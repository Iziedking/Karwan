import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// Every read an agent pays for is counted, whichever paid endpoint it hit.
/// The 16 Oct 2026 testnet spike paid for a credit passport, which writes no
/// record-read receipt, so the public count stayed at zero.
///
///   npx tsx --test src/routes/x402PaidReads.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-x402-paid-reads-')));
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
process.env.KARWAN_TREASURY_ADDR = `0x${'7'.repeat(40)}`;

const { x402Routes } = await import('./x402.js');
const { facilitator } = await import('../x402/sellerFacilitator.js');
const { paidReadTotals } = await import('../db/paidReads.js');
const { ARC } = await import('../chain/client.js');
const { upsertProfile } = await import('../db/profiles.js');

let settles = true;
Object.assign(facilitator, {
  getSupported: async () => ({
    kinds: [
      {
        x402Version: 2,
        scheme: 'exact',
        network: ARC.caip2,
        extra: {
          verifyingContract: `0x${'9'.repeat(40)}`,
          assets: [{ symbol: 'USDC', address: `0x${'3'.repeat(40)}` }],
        },
      },
    ],
  }),
  verify: async () => ({ isValid: true, payer: `0x${'b'.repeat(40)}` }),
  settle: async () =>
    settles
      ? { success: true, transaction: 'bc093ff6-0000', payer: `0x${'b'.repeat(40)}` }
      : { success: false, errorReason: 'insufficient_balance' },
});

const signature = Buffer.from(
  JSON.stringify({ x402Version: 2, payload: {}, accepted: { network: ARC.caip2 } }),
).toString('base64');

const get = (path: string, paid = true) =>
  x402Routes.request(new Request(`http://local${path}`, { headers: paid ? { 'payment-signature': signature } : {} }));

const SUBJECT = `0x${'c'.repeat(40)}`;

test('an unpaid request is offered a price and is not counted', async () => {
  const res = await get('/skill-demand/rust', false);
  assert.equal(res.status, 402);
  assert.equal((await paidReadTotals()).reads, 0);
});

test('a settled skill-demand read counts', async () => {
  const res = await get('/skill-demand/rust');
  assert.equal(res.status, 200);
  assert.deepEqual((await paidReadTotals()).byEndpoint, { 'skill-demand': 1 });
});

test('a settled credit-passport read counts, the path the spike took', async () => {
  // A passport read comes from outside the market, so the person must allow it.
  await upsertProfile({ address: SUBJECT, role: 'seller', displayName: 'Ada', reputationSources: { outsideReadable: true } } as never);
  const res = await get(`/credit-passport/${SUBJECT}`);
  assert.equal(res.status, 200, await res.text());
  const totals = await paidReadTotals();
  assert.equal(totals.byEndpoint['credit-passport'], 1);
  assert.equal(totals.reads, 2);
});

test('a payment that fails to settle is not counted', async () => {
  settles = false;
  const res = await get('/skill-demand/rust');
  assert.equal(res.status, 402);
  assert.equal((await paidReadTotals()).reads, 2);
  settles = true;
});
