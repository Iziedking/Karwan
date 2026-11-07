import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const form = readFileSync(new URL('./components/PostListingForm.tsx', import.meta.url), 'utf8');
const list = form.slice(form.indexOf('pl.yourOffers.eyebrow'));

test('Your offers reads like the Request list', () => {
  assert.doesNotMatch(list, /text-\[13px\]|uppercase|\bmono\b/, 'no small mono capitals');
  assert.doesNotMatch(list, /title=\{pl\.dismissTitle\}/, 'no browser tooltip on dismiss');
  assert.doesNotMatch(list, /role="link"/, 'each row is a real link');
  assert.match(list, /<Link\s/);
  assert.match(list, /money\.price\(l\.askingPriceUsdc, l\.askingLocal\)/, 'the price in the chosen currency, as the seller typed it (view 55)');
  assert.match(list, /rounded-full px-2\.5 py-0\.5 text-\[14px\] font-semibold/, 'status is a tinted label');
  assert.match(list, /<Icon name="chevron-right"[^>]*directional/);
  assert.match(list, /<Icon name="close"/);
});

test('your agent\'s offers sit in Your offers, under the posted offer they came from (owner, 7 Nov 2026)', () => {
  assert.match(list, /bids\.find\(\(b\) => b\.jobId === l\.matchedJobId\)/);
  assert.match(list, /<OfferBidLine bid=\{bid\} nested onWithdrawn=\{withdrawn\} \/>/);
  assert.match(list, /ownRows\.map/);
  const page = readFileSync(new URL('../../app/seller/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /BidsTable|activeBids\.tag/, 'no second table of the same offers');
  const line = readFileSync(new URL('./components/OfferBidLine.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(line, /shortHash|jobBuyer/, 'a request is named in words, never by id or wallet');
  assert.match(line, /money\.text\(bid\.lastBidPrice\)/);
});
