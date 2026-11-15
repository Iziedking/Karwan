import assert from 'node:assert/strict';
import test from 'node:test';
import { pageKind, suggestedQuestions } from './suggestedQuestions';

const DEAL = ['deal.money', 'deal.approvePart', 'deal.moveDate'];
const MARKET = ['market.safe', 'market.post', 'market.cost'];
const MONEY = ['money.where', 'money.withdraw', 'money.agent'];
const HOME = ['home.first', 'home.findSeller', 'home.getPaid'];

test('a deal gets the deal questions', () => {
  assert.deepEqual(suggestedQuestions('/deals/abc'), DEAL);
  assert.equal(pageKind('/deals/abc'), 'deal');
});

test('the market, a listing and an order get the market questions', () => {
  for (const path of ['/market', '/listings/x', '/order/y']) assert.deepEqual(suggestedQuestions(path), MARKET, path);
});

test('money pages get the money questions', () => {
  for (const path of ['/account', '/add', '/send', '/withdraw']) assert.deepEqual(suggestedQuestions(path), MONEY, path);
});

test('home, nowhere and anywhere else get the home questions', () => {
  for (const path of ['/app', null, '/profile/edit', '/dealsy', '']) assert.deepEqual(suggestedQuestions(path), HOME, String(path));
});

test('a query or hash on the path is ignored', () => {
  assert.deepEqual(suggestedQuestions('/market?q=rice#top'), MARKET);
  assert.deepEqual(suggestedQuestions('/deals/abc#step'), DEAL);
});

test('always three', () => {
  for (const path of ['/deals/a', '/market', '/send', '/app', null]) assert.equal(suggestedQuestions(path).length, 3);
});
