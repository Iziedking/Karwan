import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PLATFORM_GUIDE } from './platformGuide.js';

/// Aman is the only guide (view 57, 17 Nov), and since 19 Nov it guides a part
/// at a time: what the assistant reads and the public canon say so, with no
/// page tours and no New here line left in either.

test('the guide entry for Aman has no tours and describes Show me, part lines and other people’s words', () => {
  const aman = PLATFORM_GUIDE.find((e) => e.id === 'next-move')!;
  assert.ok(aman);
  assert.doesNotMatch(aman.summary, /show me around|tour_home|tour_market|tour_money|tour=|its tour|tour running|look around/i);
  assert.match(aman.summary, /no page tours/);
  assert.match(aman.summary, /Show me/);
  assert.match(aman.summary, /Aman guides you/);
  assert.match(aman.summary, /1st, 2nd, 4th and 8th visit/);
  assert.match(aman.summary, /Switch me off/);
  assert.doesNotMatch(aman.summary, /New here\? Ask me/);
  assert.match(aman.summary, /written by another person/);
  for (const source of aman.sources) assert.doesNotMatch(source, /tour/i);
});

test('the public canon says the same', () => {
  const canon = readFileSync(join(import.meta.dirname, 'canon', 'canon.public.json'), 'utf8');
  assert.match(canon, /Show me/);
  assert.match(canon, /Aman guides you a part at/);
  assert.doesNotMatch(canon, /New here/);
});
