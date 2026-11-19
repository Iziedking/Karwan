import assert from 'node:assert/strict';
import test from 'node:test';
import { lineMode, partOrder, pickPart, type PartBox } from './pickPart';

/// Aman explains the part someone stops on, or the most useful part they have
/// not heard; it sits beside the part on a laptop and under it elsewhere
/// (view 57, 19 Nov).

const view = { width: 400, height: 800 };
const box = (id: string, top: number, height: number, order: number, extra: Partial<PartBox> = {}): PartBox =>
  ({ id, rect: { left: 16, top, width: 368, height }, order, hidden: false, ...extra });

test('the part crossing the middle of the screen is explained; the smaller wins a tie', () => {
  const parts = [box('big', 100, 600, 0), box('small', 380, 60, 5), box('off', 900, 40, 1)];
  assert.equal(pickPart({ parts, heard: new Set(), viewport: view }), 'small');
});

test('with nothing on the middle line, the most useful unheard part fully on screen', () => {
  const parts = [box('later', 50, 60, 4), box('first', 600, 60, 1), box('cut', 760, 80, 0)];
  assert.equal(pickPart({ parts, heard: new Set(), viewport: view }), 'first');
});

test('heard and hidden parts are never explained', () => {
  const parts = [box('mid', 380, 60, 0), box('gone', 100, 60, 1, { hidden: true }), box('top', 50, 40, 2)];
  assert.equal(pickPart({ parts, heard: new Set(['mid']), viewport: view }), 'top');
  assert.equal(pickPart({ parts, heard: new Set(['mid', 'top']), viewport: view }), null);
  assert.equal(pickPart({ parts: [], heard: new Set(), viewport: view }), null);
});

test('a phone and a tablet get the line under the part', () => {
  assert.deepEqual(lineMode({ viewportWidth: 1023, partRect: { left: 100, top: 0, width: 300, height: 40 }, rtl: false }), { mode: 'inline' });
});

test('a laptop gets it beside the part, on the reading side first', () => {
  const rect = { left: 400, top: 200, width: 480, height: 40 };
  assert.deepEqual(lineMode({ viewportWidth: 1280, partRect: rect, rtl: false }), { mode: 'beside', side: 'end' });
  assert.deepEqual(lineMode({ viewportWidth: 1280, partRect: { left: 800, top: 0, width: 400, height: 40 }, rtl: false }), { mode: 'beside', side: 'start' });
  assert.deepEqual(lineMode({ viewportWidth: 1280, partRect: { left: 400, top: 0, width: 800, height: 40 }, rtl: true }), { mode: 'beside', side: 'end' });
});

test('a laptop part with no room either side gets the line under it', () => {
  assert.deepEqual(lineMode({ viewportWidth: 1280, partRect: { left: 200, top: 0, width: 880, height: 40 }, rtl: false }), { mode: 'inline' });
});

test('usefulness follows the order of the lines; an unknown part comes last', () => {
  assert.ok(partOrder('home-money') < partOrder('home-deals'));
  assert.equal(partOrder('not-a-part'), Infinity);
});
