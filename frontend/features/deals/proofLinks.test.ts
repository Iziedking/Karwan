import assert from 'node:assert/strict';
import test from 'node:test';
import { proofSegments } from './proofLinks';

test('links a bare submitted domain with https', () => {
  const parts = proofSegments('Delivery is at recharge.com');
  assert.deepEqual(parts, [
    { text: 'Delivery is at ' },
    { text: 'recharge.com', href: 'https://recharge.com/' },
  ]);
});

test('preserves punctuation outside a full URL', () => {
  const parts = proofSegments('Open https://example.com/work, then review.');
  assert.deepEqual(parts.slice(0, 3), [
    { text: 'Open ' },
    { text: 'https://example.com/work', href: 'https://example.com/work' },
    { text: ',' },
  ]);
});

test('does not turn an email domain or unsafe scheme into a link', () => {
  assert.deepEqual(proofSegments('Email seller@example.com or use javascript:alert(1)'), [
    { text: 'Email seller@example.com or use javascript:alert(1)' },
  ]);
});
