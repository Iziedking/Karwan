import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// The ticker's USDC figure is settled volume. Created value counts deals that
/// were never funded or were cancelled, so it must never appear as money moved.

const source = readFileSync(new URL('./components/StatsTicker.tsx', import.meta.url), 'utf8');

test('the ticker quotes settled volume and never created value', () => {
  assert.match(source, /settledVolumeUsdc/);
  assert.doesNotMatch(source, /createdValueUsdc|\.volumeUsdc/);
});
