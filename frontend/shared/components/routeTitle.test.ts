import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./RouteTitle.tsx', import.meta.url), 'utf8');

test('the page name holds in the tab even when the framework writes its default title after load', () => {
  // Set once on navigation, the layout's own title used to win the race.
  assert.match(source, /new MutationObserver\(/);
  assert.match(source, /if \(document\.title !== wanted\) document\.title = wanted/);
  assert.match(source, /observer\.disconnect\(\)/);
});
