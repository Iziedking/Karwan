import assert from 'node:assert/strict';
import test from 'node:test';
import { offerErrors, requestErrors } from './formRules';

const request = { need: 'Logo for my bakery', budget: '120', days: '5', room: '', split: '' };

test('a request the backend would refuse is stopped in the form', () => {
  assert.deepEqual(requestErrors(request), []);
  assert.deepEqual(requestErrors({ ...request, need: 'Logo' }), ['need']);
  assert.deepEqual(requestErrors({ ...request, need: 'x'.repeat(501) }), ['need']);
  assert.deepEqual(requestErrors({ ...request, days: '91' }), ['when']);
  assert.deepEqual(requestErrors({ ...request, days: '90' }), []);
  assert.deepEqual(requestErrors({ ...request, budget: '0' }), ['budget']);
  assert.deepEqual(requestErrors({ ...request, budget: '5000001' }), ['budget']);
  assert.deepEqual(requestErrors({ ...request, room: '51' }), ['room']);
  assert.deepEqual(requestErrors({ ...request, split: '30, 60' }), ['split']);
  assert.deepEqual(requestErrors({ ...request, split: '30, 70' }), []);
});

test('an amount too small to express in USDC units is refused, not sent', () => {
  assert.deepEqual(requestErrors({ ...request, budget: '0.0000001' }), ['budget']);
  assert.deepEqual(requestErrors({ ...request, budget: '0.000001' }), []);
});

const offer = { what: 'Logo design', details: 'SVG and PNG files', price: '90', room: '', ttl: '30' };

test('an offer the backend would refuse is stopped in the form, details included', () => {
  assert.deepEqual(offerErrors(offer), []);
  assert.deepEqual(offerErrors({ ...offer, what: 'Lo' }), ['what']);
  assert.deepEqual(offerErrors({ ...offer, details: '' }), ['details']);
  assert.deepEqual(offerErrors({ ...offer, details: 'abcd' }), ['details']);
  assert.deepEqual(offerErrors({ ...offer, ttl: '91' }), ['ttl']);
  assert.deepEqual(offerErrors({ ...offer, price: '-1' }), ['price']);
});
