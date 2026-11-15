import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ROUTE_STEP_MS, routeMotion } from './routeMotion';

/// The route moves (view 48, owner 15 Nov 2026): on first paint the reached
/// stops come in one after another; later only what was newly reached moves.

test('first paint brings every reached stop in, in order', () => {
  const m = routeMotion(null, ['passed', 'passed', 'here', 'next']);
  assert.deepEqual(m.map((s) => s.enter), [true, true, true, false]);
  assert.deepEqual(m.map((s) => s.delayMs), [0, ROUTE_STEP_MS, ROUTE_STEP_MS * 2, 0]);
});

test('a step that moves on brings in only what was newly reached', () => {
  const m = routeMotion(['passed', 'passed', 'here', 'next'], ['passed', 'passed', 'passed', 'here']);
  assert.deepEqual(m.map((s) => s.enter), [false, false, true, true]);
  assert.deepEqual(m.map((s) => s.delayMs), [0, 0, 0, ROUTE_STEP_MS]);
});

test('the same marks again move nothing', () => {
  const marks = ['passed', 'here', 'next'] as const;
  assert.ok(routeMotion([...marks], [...marks]).every((s) => !s.enter));
});

test('a different number of stops is a first paint', () => {
  const m = routeMotion(['passed', 'here'], ['passed', 'passed', 'here', 'next']);
  assert.deepEqual(m.map((s) => s.enter), [true, true, true, false]);
});

test('with reduced motion every route animation is switched off', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(here, '../../app/globals.css'), 'utf8');
  const block = css.slice(css.indexOf('/* Deal route motion'));
  const names = [...block.matchAll(/@keyframes (route-[a-z-]+)/g)].map((m) => m[1]);
  assert.ok(names.length >= 4, 'the route keyframes are defined');
  const reduced = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const sel of ['[data-route-enter]', '[data-route-mark="here"]::after', '[data-route-line="ahead"]', '[data-route-fill]']) {
    assert.ok(reduced.includes(sel), `${sel} stops under reduced motion`);
  }
  assert.match(reduced, /animation:\s*none/);
});
