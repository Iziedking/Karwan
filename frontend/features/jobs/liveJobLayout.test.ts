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
  assert.match(page, /data-guide="job-bids"/);
  assert.ok(page.indexOf('data-guide="job-flow"') < page.indexOf('data-guide="job-bids"'));
  assert.ok(page.indexOf('data-guide="job-bids"') < page.indexOf('rs.details'));
});
