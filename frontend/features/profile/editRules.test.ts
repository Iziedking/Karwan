import assert from 'node:assert/strict';
import test from 'node:test';
import { editBlockers, type EditState } from './editRules';

const ok: EditState = {
  role: 'both',
  needsName: true,
  displayName: 'Ada',
  skills: 'logo design',
  bio: 'Fast and careful',
  sellerMin: 10,
  sellerMax: 2000,
  sellerMinDays: 1,
  sellerMaxDays: 30,
  buyerMax: 5000,
  buyerMinDays: 30,
  buyerMaxDays: 60,
  split: '50,50',
};

test('a complete form has nothing blocking Save', () => {
  assert.deepEqual(editBlockers(ok), []);
});

test('each rule that blocks Save is named, so the page can say which field needs what', () => {
  assert.deepEqual(editBlockers({ ...ok, displayName: '  ' }), ['name']);
  assert.deepEqual(editBlockers({ ...ok, skills: ' , ' }), ['offer']);
  assert.deepEqual(editBlockers({ ...ok, bio: '' }), ['bio']);
  assert.deepEqual(editBlockers({ ...ok, sellerMax: 10 }), ['sellerPrice']);
  assert.deepEqual(editBlockers({ ...ok, sellerMin: Number.NaN }), ['sellerPrice']);
  assert.deepEqual(editBlockers({ ...ok, sellerMaxDays: 0 }), ['sellerDays']);
  assert.deepEqual(editBlockers({ ...ok, buyerMax: 0 }), ['buyerMax']);
  assert.deepEqual(editBlockers({ ...ok, buyerMinDays: 70 }), ['buyerDays']);
  assert.deepEqual(editBlockers({ ...ok, split: '40,50' }), ['split']);
});

test('only the agents in use are checked, and a business name lives elsewhere', () => {
  assert.deepEqual(editBlockers({ ...ok, role: 'buyer', bio: '', skills: '' }), []);
  assert.deepEqual(editBlockers({ ...ok, role: 'seller', split: 'x' }), []);
  assert.deepEqual(editBlockers({ ...ok, needsName: false, displayName: '' }), []);
});
