import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTER_S, PLEASED_MS, blinkDelay, enterFrom, isMoneyFlow, mayMove, maySpeak } from './amanMotion';

const still = { typing: false, fastScroll: false, dialogOpen: false, moneyFlow: false, reducedMotion: false };
const ready = { typing: false, dialogOpen: false, moneyFlow: false, spokenThisVisit: false, quietHere: false, guide: 'on' as const };

test('moves only when nothing holds it still', () => {
  assert.equal(mayMove(still), true);
  for (const key of Object.keys(still) as Array<keyof typeof still>) {
    assert.equal(mayMove({ ...still, [key]: true }), false, key);
  }
});

test('speaks only when nothing keeps it quiet', () => {
  assert.equal(maySpeak(ready), true);
  for (const key of ['typing', 'dialogOpen', 'moneyFlow', 'spokenThisVisit', 'quietHere'] as const) {
    assert.equal(maySpeak({ ...ready, [key]: true }), false, key);
  }
  assert.equal(maySpeak({ ...ready, guide: 'face' }), false);
  assert.equal(maySpeak({ ...ready, guide: 'off' }), false);
});

test('money flows are the send, withdraw, add and cashout pages', () => {
  for (const path of ['/send', '/send/abc', '/withdraw', '/add/', '/cashout/x/y']) assert.equal(isMoneyFlow(path), true, path);
  for (const path of ['/sender', '/app', '/market', '/additional', '/']) assert.equal(isMoneyFlow(path), false, path);
});

test('a blink comes every 4 to 7 seconds, the same for the same visit', () => {
  for (let seed = 0; seed < 100; seed += 1) {
    for (let n = 0; n < 5; n += 1) {
      const d = blinkDelay(seed, n);
      assert.ok(d >= 4000 && d <= 7000, `${seed} ${n} ${d}`);
      assert.equal(blinkDelay(seed, n), d);
    }
  }
  assert.notEqual(blinkDelay(1, 0), blinkDelay(2, 0));
});

test('Aman slides in from the inline edge, and only fades with reduced motion', () => {
  assert.deepEqual(enterFrom(false, false), { x: 24, opacity: 0 });
  assert.deepEqual(enterFrom(true, false), { x: -24, opacity: 0 });
  assert.deepEqual(enterFrom(false, true), { x: 0, opacity: 0 });
  assert.equal(ENTER_S, 0.24);
  assert.equal(PLEASED_MS, 1500);
});
