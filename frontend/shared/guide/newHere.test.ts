import assert from 'node:assert/strict';
import test from 'node:test';
import { NEW_HERE_QUESTIONS, newHereFits, newHereOff, newHerePage } from './newHere';
import { QUESTION_KEYS } from '../i18n/messages/guide';

/// New here? (view 57, 17 Nov): someone new is answered, not walked through.

const base = { newcomer: true, pathname: '/app', off: false, urgent: false, seen: false };

test('the four pages it speaks on', () => {
  assert.equal(newHerePage('/app'), 'home');
  assert.equal(newHerePage('/market'), 'market');
  assert.equal(newHerePage('/deals/0xabc'), 'deal');
  assert.equal(newHerePage('/deals/0xabc?point=x'), 'deal');
  assert.equal(newHerePage('/account'), 'money');
  for (const other of ['/deals', '/settings', '/market/x', '/account/agent', '/']) assert.equal(newHerePage(other), null, other);
});

test('it fits a newcomer on those pages only', () => {
  for (const pathname of ['/app', '/market', '/deals/0xabc', '/account']) assert.equal(newHereFits({ ...base, pathname }), true, pathname);
  assert.equal(newHereFits({ ...base, pathname: '/deals' }), false);
  assert.equal(newHereFits({ ...base, pathname: '/settings' }), false);
});

test('not for someone who is not new, said Not now, has something urgent or saw it this visit', () => {
  assert.equal(newHereFits({ ...base, newcomer: false }), false);
  assert.equal(newHereFits({ ...base, off: true }), false);
  assert.equal(newHereFits({ ...base, urgent: true }), false);
  assert.equal(newHereFits({ ...base, seen: true }), false);
});

test('guideTourOffer off counts as off', () => {
  assert.equal(newHereOff({ guideTourOffer: 'off' }), true);
  assert.equal(newHereOff({ guideNewHere: 'off' }), true);
  assert.equal(newHereOff({}), false);
  assert.equal(newHereOff(undefined), false);
});

test('three questions for each page, from the page questions', () => {
  for (const keys of Object.values(NEW_HERE_QUESTIONS)) {
    assert.equal(keys.length, 3);
    for (const k of keys) assert.ok((QUESTION_KEYS as readonly string[]).includes(k), k);
  }
});
