import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// An offer on a family deal keeps the seller's signed terms (view 18).
///
///   npx tsx --test src/db/factoring.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-factoring-')));
delete process.env.DATABASE_URL;
const { createFactoringOffer, getFactoringOffer, patchFactoringOffer } = await import('./factoring.js');

test('a family offer round-trips its signed terms through the store', async () => {
  const created = await createFactoringOffer({
    id: 'family-1',
    invoiceId: '0xDEAL',
    financier: '0xF1',
    seller: '0x5E',
    faceValueUsdc: '150',
    claimableAtOfferUsdc: '150',
    offeredAdvanceUsdc: '120',
    expectedReturnUsdc: '123.6',
    discountBps: 2000,
    status: 'offered',
    offeredAt: 1,
    expiresAt: 2,
    rail: 'family',
    stakeMicros: '12000000',
    financierWalletId: 'wallet-f1',
  });
  const signed = {
    assign: { nonce: '7', deadline: '86400', sig: '0xaa' as const },
    reserve: { deadline: '86400', sig: '0xbb' as const },
    expiresAt: '18144000',
  };
  await patchFactoringOffer(created.id, {
    status: 'awaiting_financier',
    lineId: `0x${'1'.repeat(64)}`,
    sellerSigned: signed,
    sellerDeadline: 86_400_000,
  });
  const back = await getFactoringOffer('family-1');
  assert.equal(back?.status, 'awaiting_financier');
  assert.equal(back?.rail, 'family');
  assert.equal(back?.stakeMicros, '12000000');
  assert.equal(back?.financierWalletId, 'wallet-f1');
  assert.deepEqual(back?.sellerSigned, signed);
  assert.equal(back?.sellerDeadline, 86_400_000);
});

test('the older watcher never sees a family line', async () => {
  const { listAcceptedOffers } = await import('./factoring.js');
  const base = { invoiceId: '0xd2', financier: '0xf1', seller: '0x5e', faceValueUsdc: '10', offeredAdvanceUsdc: '8', expectedReturnUsdc: '9', discountBps: 2000, status: 'accepted' as const, offeredAt: 1, expiresAt: 2 };
  await createFactoringOffer({ ...base, id: 'older-1' });
  await createFactoringOffer({ ...base, id: 'family-2', rail: 'family' });
  const ids = (await listAcceptedOffers()).map((o) => o.id);
  assert.ok(ids.includes('older-1'));
  assert.ok(!ids.includes('family-2'));
});

test('the runner lists only taken family lines', async () => {
  const { listOpenFamilyLines } = await import('./factoring.js');
  const base = { invoiceId: '0xd3', financier: '0xf1', seller: '0x5e', faceValueUsdc: '10', offeredAdvanceUsdc: '8', expectedReturnUsdc: '9', discountBps: 2000, offeredAt: 1, expiresAt: 2, rail: 'family' as const };
  await createFactoringOffer({ ...base, id: 'line-open', status: 'accepted' });
  await createFactoringOffer({ ...base, id: 'line-waiting', status: 'awaiting_financier' });
  await createFactoringOffer({ ...base, id: 'line-done', status: 'repaid' });
  assert.deepEqual((await listOpenFamilyLines()).map((o) => o.id).filter((id) => id.startsWith('line-')), ['line-open']);
});
