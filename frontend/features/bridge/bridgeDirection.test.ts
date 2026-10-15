import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../app/bridge/page.tsx', import.meta.url), 'utf8');
const tours = readFileSync(new URL('../../shared/guide/tours.ts', import.meta.url), 'utf8');

test('Add shows only adding and Withdraw only withdrawing; the page never offers the other side', () => {
  assert.doesNotMatch(page, /DirToggle/);
  assert.doesNotMatch(page, /setDirection/);
  assert.match(page, /const direction: Direction = requestedDirection === 'out' \? 'out' : 'in';/);
  assert.doesNotMatch(tours, /target: 'bridge-direction'/);
});
