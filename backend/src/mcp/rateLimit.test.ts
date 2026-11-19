import assert from 'node:assert/strict';
import test from 'node:test';
import { windowLimiter } from './rateLimit.js';

/// A per-caller limit for the free MCP rating read (view 93).

test('the 61st call in a minute is refused, and the next minute is open again', () => {
  let now = 0;
  const allowed = windowLimiter(60, 60_000, () => now);
  for (let i = 0; i < 60; i++) assert.equal(allowed('0xagent'), true);
  assert.equal(allowed('0xagent'), false);
  assert.equal(allowed('0xother'), true, 'each caller has their own count');
  now = 60_000;
  assert.equal(allowed('0xagent'), true);
});
