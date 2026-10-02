import assert from 'node:assert/strict';
import test from 'node:test';
import { workKind } from './workKind';

test('the market cards in view read as their own kind of work', () => {
  assert.equal(workKind('Branded tape, 12 rolls, Lagos delivery', 'Packing tape printed with your logo.'), 'goods');
  assert.equal(workKind('Interview question bank for clients in Kenya'), 'writing');
  assert.equal(workKind('Web3 dashboard for clients in Nigeria'), 'code');
  assert.equal(workKind('Event budget plan for clients in the US'), 'money');
  assert.equal(workKind('Need a support chatbot trained on our help centre.'), 'ai');
});

test('goods win over the design printed on them', () => {
  assert.equal(workKind('200 T-shirts with our logo'), 'apparel');
  assert.equal(workKind('Used iPhone 14, 128 GB'), 'device');
  assert.equal(workKind('Logo design for a bakery'), 'design');
});

test('the title decides before the description, and unknown work stays general', () => {
  assert.equal(workKind('EN to AR translation', 'Two pages of website copy.'), 'translation');
  assert.equal(workKind('Something special', 'A short promo video.'), 'media');
  assert.equal(workKind('Something special'), 'general');
});

test('words are matched whole, so a brand name does not read as a bot', () => {
  assert.equal(workKind('Robotics kit'), 'general');
  assert.equal(workKind('Appetiser catering'), 'general');
});
