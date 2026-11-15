import assert from 'node:assert/strict';
import test from 'node:test';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { fitCachePoints, withoutCachePoints } from './cachePoints.js';
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

function recorder(modelId: string) {
  const seen: { prompt: Array<{ providerOptions?: Record<string, Record<string, unknown>> }> } = { prompt: [] };
  const mock = new MockLanguageModelV3({
    modelId,
    doGenerate: async (options) => {
      seen.prompt = options.prompt as typeof seen.prompt;
      return {
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        warnings: [],
      };
    },
  });
  return { mock, seen };
}

test('a Bedrock model that is not Claude keeps its cache point without the hour', async () => {
  const { mock, seen } = recorder('us.amazon.nova-lite-v1:0');
  await generateText({ model: fitCachePoints(mock), system: systemMessages('F', 'P'), prompt: 'hi' });
  assert.deepEqual(seen.prompt[0]!.providerOptions?.bedrock?.cachePoint, { type: 'default' });
  assert.deepEqual(seen.prompt[0]!.providerOptions?.anthropic, { cacheControl: { type: 'ephemeral', ttl: '1h' } });
});

test('a Claude model on Bedrock keeps the hour', async () => {
  const { mock, seen } = recorder('us.anthropic.claude-haiku-4-5-20251001-v1:0');
  await generateText({ model: fitCachePoints(mock), system: systemMessages('F', 'P'), prompt: 'hi' });
  assert.deepEqual(seen.prompt[0]!.providerOptions?.bedrock?.cachePoint, { type: 'default', ttl: '1h' });
});
