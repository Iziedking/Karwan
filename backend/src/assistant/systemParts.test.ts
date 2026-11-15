import assert from 'node:assert/strict';
import test from 'node:test';
import { systemMessages } from './systemParts.js';
import { systemPromptFor } from './knowledge.js';
import { hiddenGuideIds } from '../features.js';
import { liveFeatures } from '../featuresLive.js';

test('the fixed part carries a 1-hour cache point for Bedrock and Anthropic', () => {
  assert.deepEqual(systemMessages('F', 'P'), [
    {
      role: 'system',
      content: 'F',
      providerOptions: {
        bedrock: { cachePoint: { type: 'default', ttl: '1h' } },
        anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
      },
    },
    { role: 'system', content: 'P' },
  ]);
});

test('an empty per-person part sends one message', () => {
  assert.equal(systemMessages('F', '').length, 1);
});

test('the fixed part is the same for two people', () => {
  const a = systemPromptFor({ mode: 'assistant', hidden: hiddenGuideIds(liveFeatures) });
  const b = systemPromptFor({ mode: 'assistant', hidden: hiddenGuideIds(liveFeatures) });
  assert.equal(a, b);
  for (const address of ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222']) {
    assert.equal(a.includes(address), false);
  }
});
