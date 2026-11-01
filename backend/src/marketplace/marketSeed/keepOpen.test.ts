import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-example-keeper-')));
delete process.env.DATABASE_URL;

const { createListing, getListing, cancelListing } = await import('../../db/listings.js');
const { reopenLapsedExamples, EXAMPLE_TTL_DAYS } = await import('./keepOpen.js');
const { SEED_PREFIX } = await import('./plan.js');

const seller = { sellerUser: '0x00000000000000000000000000000000000000aa', sellerAgent: '0x00000000000000000000000000000000000000ab', description: 'd', askingPriceUsdc: 50 };
const DAY = 24 * 60 * 60 * 1000;

test('a lapsed example opens again; real offers and withdrawn examples are left alone', () => {
  const example = createListing({ ...seller, title: 'Logo', seedKey: `${SEED_PREFIX}offer-1`, ttlDays: 30 });
  const withdrawn = createListing({ ...seller, title: 'Cards', seedKey: `${SEED_PREFIX}offer-2`, ttlDays: 30 });
  cancelListing(withdrawn.id);
  const real = createListing({ ...seller, title: 'Shoes', ttlDays: 30 });
  const later = Date.now() + 31 * DAY;

  assert.equal(reopenLapsedExamples(later), 1);
  assert.equal(getListing(example.id)?.expiresAt, later + EXAMPLE_TTL_DAYS * DAY);
  assert.equal(getListing(withdrawn.id)?.expiresAt, withdrawn.expiresAt);
  assert.equal(getListing(real.id)?.expiresAt, real.expiresAt);
  // Already open: nothing to do.
  assert.equal(reopenLapsedExamples(later), 0);
});
