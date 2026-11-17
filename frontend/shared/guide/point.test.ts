import assert from 'node:assert/strict';
import test from 'node:test';
import { POINT_MS, pointFromUrl, withoutPoint } from './point';

/// Show me (view 57, 17 Nov): ?point=<id> lights one part of the page.

test('a plain point id is read from the link', () => {
  assert.equal(pointFromUrl('?point=home-money'), 'home-money');
  assert.equal(pointFromUrl('?tab=agent&point=home-money'), 'home-money');
  assert.equal(pointFromUrl('point=home-money'), 'home-money');
});

test('anything else is ignored before the page is touched', () => {
  for (const search of ['', '?point=', '?point=Home', '?point=a', `?point=${'x'.repeat(41)}`, '?point=..%2F', '?point=%3Cscript%3E', '?point=home_money', '?tab=agent']) {
    assert.equal(pointFromUrl(search), null, search);
  }
});

test('the link loses only the point once it is shown', () => {
  assert.equal(withoutPoint('?point=x&tab=agent'), '?tab=agent');
  assert.equal(withoutPoint('?point=home-money'), '');
  assert.equal(withoutPoint('?tab=agent'), '?tab=agent');
  assert.equal(withoutPoint(''), '');
});

test('the part stays lit for eight seconds', () => {
  assert.equal(POINT_MS, 8000);
});

test('only a point we have a line for counts, never a name on every object', async () => {
  const { isPoint } = await import('./point');
  assert.equal(isPoint('home-money'), true);
  for (const id of ['constructor', 'tostring', 'hasownproperty', 'nope']) assert.equal(isPoint(id), false, id);
});
