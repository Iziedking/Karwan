import assert from 'node:assert/strict';
import test from 'node:test';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { withoutCachePoints } from './cachePoints.js';
import { systemMessages } from '../assistant/systemParts.js';

test('a model that cannot cache gets the call without cache points', async () => {
  let seen: Array<{ providerOptions?: Record<string, Record<string, unknown>> }> = [];
  const mock = new MockLanguageModelV3({
    doGenerate: async (options) => {
      seen = options.prompt as typeof seen;
      return {
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        warnings: [],
      };
    },
  });
  await generateText({ model: withoutCachePoints(mock), system: systemMessages('F', 'P'), prompt: 'hi' });
  assert.ok(seen.length >= 2);
  for (const m of seen) assert.equal(m.providerOptions?.bedrock?.cachePoint, undefined);
  assert.deepEqual(seen[0]!.providerOptions?.anthropic, { cacheControl: { type: 'ephemeral', ttl: '1h' } });
});
