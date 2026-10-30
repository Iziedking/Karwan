import assert from 'node:assert/strict';
import test from 'node:test';
import { dealLayers } from './dealLayers';

const base = { signedIn: true, delivered: false, needsHandover: false, canGetPaid: false, funded: false, problems: 0, heldDelivery: false, unread: false };
const keys = (i: Partial<typeof base>) => dealLayers({ ...base, ...i }).map((l) => l.key);

test('a new deal shows only what exists yet, in a fixed order', () => {
  assert.deepEqual(keys({}), ['progress', 'messages', 'agreement']);
  assert.deepEqual(keys({ signedIn: false }), ['progress', 'agreement']);
});

test('rows appear as the deal moves: delivery, receipts, get paid now and problems', () => {
  assert.deepEqual(
    keys({ funded: true, delivered: true, canGetPaid: true, problems: 2 }),
    ['progress', 'delivery', 'getPaid', 'messages', 'agreement', 'receipts', 'problem'],
  );
});

test('whatever needs the person rises to the top, marked', () => {
  const layers = dealLayers({ ...base, funded: true, delivered: true, heldDelivery: true, unread: true });
  assert.deepEqual(layers.map((l) => l.key), ['delivery', 'messages', 'progress', 'agreement', 'receipts']);
  assert.deepEqual(layers.filter((l) => l.attention).map((l) => l.key), ['delivery', 'messages']);
});

test('the buyer sees the handover code first while goods are on the way', () => {
  assert.equal(keys({ funded: true, needsHandover: true })[0], 'handover');
});
