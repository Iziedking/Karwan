import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('the request page is one column with offers under the request, not a side rail', () => {
  const page = readFileSync(
    fileURLToPath(new URL('./components/LiveJobPage.tsx', import.meta.url)),
    'utf8',
  );

  assert.match(page, /max-w-\[760px\]/);
  assert.doesNotMatch(page, /lg:row-span-2/);
  // The offers roster carries the tour anchor and sits under the request.
  const roster = readFileSync(fileURLToPath(new URL('./components/OffersRoster.tsx', import.meta.url)), 'utf8');
  assert.match(roster, /data-guide="job-bids"/);
  assert.ok(page.indexOf('data-guide="job-flow"') < page.indexOf('<OffersRoster'));
  assert.ok(page.indexOf('<OffersRoster') < page.indexOf('rs.details'));
});
