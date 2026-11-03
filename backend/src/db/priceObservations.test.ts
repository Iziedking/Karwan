import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
const { allDealPrices, categoryPriceSnapshot, priceBucket, rebucket, recordDealPrice } = await import('./priceObservations.js');

/// Deals are bucketed by market category when one is found (view 48, step 4),
/// so a few deals form a median instead of one bucket per keyword set.

test('a deal goes in its category bucket, whatever its exact keywords', () => {
  assert.equal(priceBucket(['logo', 'brand identity']), 'cat:design');
  assert.equal(priceBucket(['Backend developer', 'rest api']), 'cat:tech');
  assert.equal(priceBucket(['something', 'unusual']), 'something|unusual');
});

test('a stored keyword bucket is read back into its category', () => {
  assert.equal(rebucket('api|backend|backend developer|developer|rest api|web service'), 'cat:tech');
  assert.equal(rebucket('cat:farm'), 'cat:farm');
  assert.equal(rebucket('outlier'), 'outlier');
});

test('four deals with different words in one category give a median', () => {
  const now = Date.now();
  recordDealPrice({ jobId: 'j1', keywords: ['logo'], priceUsdc: 40, ts: now });
  recordDealPrice({ jobId: 'j2', keywords: ['flyer', 'printing'], priceUsdc: 60, ts: now });
  recordDealPrice({ jobId: 'j3', keywords: ['brand', 'branding'], priceUsdc: 50, ts: now });
  recordDealPrice({ jobId: 'j4', keywords: ['poster'], priceUsdc: 55, ts: now });
  const snap = categoryPriceSnapshot(['business card']);
  assert.equal(snap?.sampleCount, 4);
  assert.equal(snap?.median, 50);
  const design = allDealPrices().filter((d) => d.category === 'design');
  assert.equal(design.length, 4);
});
