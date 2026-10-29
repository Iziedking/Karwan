import assert from 'node:assert/strict';
import test from 'node:test';
import { RELEVANT, recipientsFor, summaryFor } from './notifier.js';
import type { KarwanEvent } from '../events.js';

/// An update on hourly work (view 32) reaches the one person it names.
const update = {
  type: 'work.update', actor: 'platform', ts: 0,
  payload: { address: '0xWorker', text: 'Virtual assistant: 12 h 30 m approved, 186.5625 USDC paid to you.', workId: 'w_1' },
} as unknown as KarwanEvent;

test('a work update goes to the person it names, in its own words', async () => {
  assert.ok(RELEVANT.has('work.update'));
  assert.deepEqual(await recipientsFor(update), [{ address: '0xworker', role: 'self' }]);
  assert.match(summaryFor(update, 'self')!.text, /186\.5625 USDC paid to you/);
});
