import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('desktop bids rail spans the complete job stack and scrolls internally', () => {
  const page = readFileSync(
    fileURLToPath(new URL('./components/LiveJobPage.tsx', import.meta.url)),
    'utf8',
  );
  const panel = readFileSync(
    fileURLToPath(new URL('./components/LiveBidsPanel.tsx', import.meta.url)),
    'utf8',
  );

  assert.match(page, /lg:row-start-1 lg:row-span-2/);
  assert.match(page, /lg:\[contain:size\]/);
  assert.match(panel, /data-bids-scroll/);
  assert.match(panel, /lg:overflow-y-auto/);
});
