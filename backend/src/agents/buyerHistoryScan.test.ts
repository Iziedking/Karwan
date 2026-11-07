import assert from 'node:assert/strict';
import test from 'node:test';
import { alertFor } from './buyerHistoryScan.js';

const parts = { title: 'Electronics Parts Supplier', description: 'Quality electronics parts available. Wide range of components in stock. Reliable delivery and fair pricing.' };

test('someone who never asked for anything hears of a new offer as news, never as a fit (Telegram, 7 Nov)', () => {
  assert.deepEqual(alertFor([], parts), { kind: 'new' });
});

test('an offer fits only words the person used in their own request, and the alert names them', () => {
  assert.deepEqual(alertFor([{ briefText: 'Need capacitors and resistors, electronics components for a repair shop' }], parts), {
    kind: 'fits',
    words: ['electronic', 'component'],
  });
  assert.deepEqual(alertFor([{ briefText: 'A logo for my bakery' }], parts), { kind: 'new' });
});

test('shop filler never makes a fit: delivery, quality and pricing are in every offer', () => {
  assert.deepEqual(alertFor([{ briefText: 'Fast delivery, good quality, fair pricing please' }], parts), { kind: 'new' });
});

test('a private offer is never news; it reaches a person only when it fits their request', () => {
  const hidden = { ...parts, visibility: 'agents' as const };
  assert.equal(alertFor([], hidden), null);
  assert.equal(alertFor([{ briefText: 'electronics components wanted' }], hidden)?.kind, 'fits');
});
