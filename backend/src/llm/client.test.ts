import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithLlmFallback } from './client.js';

test('structured fallback reaches Anthropic after an OpenRouter schema failure', async () => {
  const models = [
    { provider: 'openrouter.ai', modelId: 'primary' },
    { provider: 'anthropic.messages', modelId: 'fallback' },
  ];
  const attempts: string[] = [];

  const result = await runWithLlmFallback(models, async (model) => {
    attempts.push(model.provider);
    if (model.provider === 'openrouter.ai') throw new Error('response did not match schema');
    return 'anthropic result';
  });

  assert.equal(result, 'anthropic result');
  assert.deepEqual(attempts, ['openrouter.ai', 'anthropic.messages']);
});

test('structured fallback preserves the final provider error', async () => {
  const models = [
    { provider: 'openrouter.ai', modelId: 'primary' },
    { provider: 'anthropic.messages', modelId: 'fallback' },
  ];
  const finalError = new Error('anthropic unavailable');

  await assert.rejects(
    runWithLlmFallback(models, async (model) => {
      if (model.provider === 'anthropic.messages') throw finalError;
      throw new Error('openrouter unavailable');
    }),
    finalError,
  );
});
