import assert from 'node:assert/strict';
import test from 'node:test';
import { clipChoice, createFrameLoop, enterProgress, pinnedProgress, stepAt, stagger } from './motion';

test('a pinned scene runs from 0 when its top meets the screen top to 1 when its bottom meets the screen bottom', () => {
  assert.equal(pinnedProgress({ top: 100, height: 3000, viewport: 900 }), 0);
  assert.equal(pinnedProgress({ top: 0, height: 3000, viewport: 900 }), 0);
  assert.equal(pinnedProgress({ top: -1050, height: 3000, viewport: 900 }), 0.5);
  assert.equal(pinnedProgress({ top: -2100, height: 3000, viewport: 900 }), 1);
  assert.equal(pinnedProgress({ top: -5000, height: 3000, viewport: 900 }), 1);
});

test('a pinned scene no taller than the screen jumps straight to its end once it reaches the top', () => {
  assert.equal(pinnedProgress({ top: 10, height: 800, viewport: 900 }), 0);
  assert.equal(pinnedProgress({ top: 0, height: 800, viewport: 900 }), 1);
});

test('an entering scene runs from 0 at the screen bottom to 1 once its top is 60% of the way up', () => {
  assert.equal(enterProgress({ top: 1000, viewport: 900 }), 0);
  assert.equal(enterProgress({ top: 900, viewport: 900 }), 0);
  assert.equal(enterProgress({ top: 630, viewport: 900 }), 0.5);
  assert.equal(enterProgress({ top: 360, viewport: 900 }), 1);
  assert.equal(enterProgress({ top: -400, viewport: 900 }), 1);
  assert.equal(enterProgress({ top: 450, viewport: 900, span: 0.5 }), 1);
});

test('the route step follows progress, and every step is reached before the end', () => {
  assert.deepEqual(stepAt(0, 5), { index: 0, within: 0 });
  assert.deepEqual(stepAt(0.5, 5), { index: 2, within: 0.5 });
  assert.equal(stepAt(0.999, 5).index, 4);
  assert.deepEqual(stepAt(1, 5), { index: 4, within: 1 });
  assert.deepEqual(stepAt(-1, 5), { index: 0, within: 0 });
});

test('tiles rise one after another, 80ms apart unless told otherwise', () => {
  assert.equal(stagger(0), 0);
  assert.equal(stagger(3), 240);
  assert.equal(stagger(2, 120), 240);
});

test('reduced motion and slow or saving connections keep the poster; phones get the small clip', () => {
  const base = { reducedMotion: false, saveData: false, effectiveType: '4g', viewportWidth: 1440 };
  assert.equal(clipChoice(base), 'large');
  assert.equal(clipChoice({ ...base, viewportWidth: 390 }), 'small');
  assert.equal(clipChoice({ ...base, viewportWidth: 767 }), 'small');
  assert.equal(clipChoice({ ...base, viewportWidth: 768 }), 'large');
  assert.equal(clipChoice({ ...base, reducedMotion: true }), 'poster');
  assert.equal(clipChoice({ ...base, saveData: true }), 'poster');
  assert.equal(clipChoice({ ...base, effectiveType: '2g' }), 'poster');
  assert.equal(clipChoice({ ...base, effectiveType: 'slow-2g' }), 'poster');
  assert.equal(clipChoice({ ...base, effectiveType: undefined }), 'large');
});

test('the frame loop runs every subscriber once per frame, however often it is woken', () => {
  const frames: (() => void)[] = [];
  const loop = createFrameLoop((cb) => { frames.push(cb); return frames.length; });
  let a = 0;
  let b = 0;
  const offA = loop.add(() => { a += 1; });
  loop.add(() => { b += 1; });
  loop.wake();
  loop.wake();
  loop.wake();
  assert.equal(frames.length, 1);
  frames.shift()!();
  assert.deepEqual([a, b], [1, 1]);
  offA();
  loop.wake();
  frames.shift()!();
  assert.deepEqual([a, b], [1, 2]);
});

test('the frame loop asks for no frame when nobody is listening', () => {
  const frames: (() => void)[] = [];
  const loop = createFrameLoop((cb) => { frames.push(cb); return 1; });
  const off = loop.add(() => {});
  off();
  loop.wake();
  assert.equal(frames.length, 0);
  assert.equal(loop.size(), 0);
});
