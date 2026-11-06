import assert from 'node:assert/strict';
import test from 'node:test';
import { pickNudge, type NextMove } from './pickNudge';
import { nextMoveCopy } from '@/shared/i18n/messages/nextMove';

const deliver: NextMove = { kind: 'approve_delivery', ref: '0xd1', href: '/deals/0xd1', amountUsdc: '120' };
const offers: NextMove = { kind: 'choose_offer', ref: '0xj1', href: '/jobs/0xj1', count: 2 };
const start: NextMove = { kind: 'first_post', href: '/buyer' };
const none = new Set<string>();

test('the most urgent move shows', () => {
  assert.equal(pickNudge({ moves: [deliver, offers], balanceTotal: 50, pathname: '/', closed: none })?.kind, 'approve_delivery');
});

test('never on the page the move points to', () => {
  assert.equal(pickNudge({ moves: [deliver, offers], balanceTotal: 50, pathname: '/deals/0xd1', closed: none })?.kind, 'choose_offer');
  assert.equal(pickNudge({ moves: [deliver], balanceTotal: 50, pathname: '/deals/0xd1/', closed: none }), null);
});

test('a move closed this visit stays closed', () => {
  assert.equal(pickNudge({ moves: [deliver, offers], balanceTotal: 50, pathname: '/', closed: new Set(['approve_delivery:0xd1']) })?.kind, 'choose_offer');
});

test('with nothing to do and no money, it asks for money first', () => {
  assert.equal(pickNudge({ moves: [start], balanceTotal: 0, pathname: '/', closed: none })?.kind, 'add_money');
  assert.equal(pickNudge({ moves: [], balanceTotal: 0, pathname: '/', closed: none })?.kind, 'add_money');
  assert.equal(pickNudge({ moves: [start], balanceTotal: 10, pathname: '/', closed: none })?.kind, 'first_post');
});

test('an unknown balance never asks for money', () => {
  assert.equal(pickNudge({ moves: [start], balanceTotal: null, pathname: '/', closed: none })?.kind, 'first_post');
  assert.equal(pickNudge({ moves: [], balanceTotal: null, pathname: '/', closed: none }), null);
});

test('money is not asked for over a real move, nor on the add money page', () => {
  assert.equal(pickNudge({ moves: [deliver], balanceTotal: 0, pathname: '/', closed: none })?.kind, 'approve_delivery');
  assert.equal(pickNudge({ moves: [start], balanceTotal: 0, pathname: '/add', closed: none })?.kind, 'first_post');
});

test('every move has a line and a button in every language, with no dashes', () => {
  for (const [locale, copy] of Object.entries(nextMoveCopy)) {
    for (const [kind, m] of Object.entries(copy.moves)) {
      assert.ok(m.line && m.action, `${locale} ${kind}`);
      assert.doesNotMatch(m.line + m.action, /—|–/, `${locale} ${kind}`);
    }
    assert.match(copy.moves.approve_delivery.line, /\{amount\}/, locale);
    assert.match(copy.moves.choose_offer.line, /\{count\}/, locale);
    assert.match(copy.moves.deliver_soon.line, /\{days\}/, locale);
  }
});
