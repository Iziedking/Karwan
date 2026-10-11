import assert from 'node:assert/strict';
import test from 'node:test';
import { startTelegramAgent } from './live.js';

test('the agent stays off unless TELEGRAM_AGENT_ENABLED is on', () => {
  assert.equal(startTelegramAgent(), false);
});
