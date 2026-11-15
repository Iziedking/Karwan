import assert from 'node:assert/strict';
import test from 'node:test';
import { PLATFORM_GUIDE, lookupPlatformGuide } from './platformGuide.js';

/// View 84: the assistant knows what the page and Telegram show while it works.
test('the guide says what Aman shows while it works', () => {
  const entry = PLATFORM_GUIDE.find((e) => e.id === 'assistant-mode')!;
  assert.match(entry.summary, /line for the step/i);
  assert.match(entry.summary, /one short tip/i);
  assert.match(entry.summary, /Telegram[^.]*typing/i);
  assert.ok(entry.api.includes('GET /api/assistant/chat/result/:turnId'));
  assert.ok(JSON.stringify(lookupPlatformGuide('why is aman slow waiting tip')).includes('assistant-mode'));
});
