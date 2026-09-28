import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { GUIDE_COPY } from './routeGuidance';
import { guidePlacement, guideSecondsLeft, GUIDE_WAIT_MS } from './placement';

const panel = { width: 420, height: 320 };
const target = { left: 500, right: 700, top: 200, bottom: 280, width: 200, height: 80 };
test('desktop card sits beside the target without covering it', () => {
  assert.deepEqual(guidePlacement(target, { width: 1440, height: 900 }, panel), { left: 724, top: 200, width: 420 });
  assert.deepEqual(guidePlacement(target, { width: 1440, height: 900 }, panel, true), { left: 56, top: 200, width: 420 });
});
test('wide targets use space below and missing targets centre', () => {
  assert.equal(guidePlacement({ ...target, left: 16, right: 1424, width: 1408 }, { width: 1440, height: 900 }, panel).top, 304);
  assert.deepEqual(guidePlacement(null, { width: 1440, height: 900 }, panel), { left: 510, top: 290, width: 420 });
});
test('mobile and short viewports keep the whole panel within its safe bounds', () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 390 }, { width: 320, height: 240 }]) {
    const p = guidePlacement(target, viewport, panel);
    assert.ok(p.left >= 16 && p.left + p.width <= viewport.width - 16);
    assert.ok(p.top >= 16 && p.top + Math.min(panel.height, viewport.height - 32) <= viewport.height - 16);
  }
});
test('countdown gives a short reading cue and never a negative wait', () => {
  assert.equal(GUIDE_WAIT_MS, 2000);
  assert.equal(guideSecondsLeft(2000, 0), 2);
  assert.equal(guideSecondsLeft(2000, 1001), 1);
  assert.equal(guideSecondsLeft(2000, 2000), 0);
  assert.equal(guideSecondsLeft(2000, 10000), 0);
});

test('the countdown gates both click and keyboard advancement, with a bypass', () => {
  const source = readFileSync('shared/guide/GuideProvider.tsx', 'utf8');
  assert.match(source, /if \(secondsLeft === 0\) next\(\)/);
  assert.match(source, /onClick=\{advance\}/);
  assert.match(source, /prev\(\) : advance\(\)/);
  assert.match(source, /advance\(\) : prev\(\)/);
  assert.match(source, /disabled=\{secondsLeft > 0\}/);
  assert.match(source, /setWaitSkipped\(true\)/);
  assert.match(source, /clearInterval\(timer\)/);
  for (const copy of Object.values(GUIDE_COPY)) {
    assert.match(copy.wait, /\{seconds\}/);
    assert.ok(copy.skipWait.length > 0);
  }
});
