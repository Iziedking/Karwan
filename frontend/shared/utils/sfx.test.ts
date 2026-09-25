import assert from 'node:assert/strict';
import test from 'node:test';
import { sfx } from './sfx';

test('sfx.playMoney is silent without a browser', () => {
  assert.doesNotThrow(() => sfx.playMoney('coinDrop'));
});
