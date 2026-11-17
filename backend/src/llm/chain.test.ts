import assert from 'node:assert/strict';
import test from 'node:test';
import type { LanguageModelV3, LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { BENCH_MS, chainLinks, fallbackChain, refusedForGood, shouldAlert } from './chain.js';

/// Every model chain ends on a model in Karwan's own AWS account (view 81),
/// and starts at Claude at Anthropic (view 89).
///
///   npx tsx --test src/llm/chain.test.ts

type Result = Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

function fake(provider: string, behaviour: Error | string): LanguageModelV3 & { calls: number } {
  const m = {
    specificationVersion: 'v3',
    provider,
    modelId: `${provider}-model`,
    supportedUrls: {},
    calls: 0,
    async doGenerate() {
      m.calls += 1;
      if (behaviour instanceof Error) throw behaviour;
      return {
        content: [
          { type: 'text', text: behaviour },
          { type: 'tool-call', toolCallId: 't1', toolName: 'get_balance', input: '{"currency":"USDC"}' },
        ],
        finishReason: 'tool-calls',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      } as unknown as Result;
    },
    async doStream() {
      throw new Error('not used');
    },
  };
  return m as unknown as LanguageModelV3 & { calls: number };
}

const opts = {} as LanguageModelV3CallOptions;

test('the order is Claude at Anthropic, Claude on Bedrock, DeepSeek on Bedrock, then OpenRouter (view 89)', () => {
  const links = { bedrock: fake('bedrock-claude', 'x'), anthropic: fake('anthropic', 'x'), fallback: fake('bedrock-deepseek', 'x'), openrouter: fake('openrouter', 'x') };
  assert.deepEqual(chainLinks(links, 'open').map((m) => m.provider), ['anthropic', 'bedrock-claude', 'bedrock-deepseek', 'openrouter']);
});

test('private chains never include OpenRouter, but do include DeepSeek on Bedrock', () => {
  const links = { bedrock: null, anthropic: fake('anthropic', 'x'), fallback: fake('bedrock-deepseek', 'x'), openrouter: fake('openrouter', 'x') };
  assert.deepEqual(chainLinks(links, 'private').map((m) => m.provider), ['anthropic', 'bedrock-deepseek']);
});

test('missing links are skipped', () => {
  assert.deepEqual(chainLinks({ bedrock: null, anthropic: null, fallback: null, openrouter: null }, 'private'), []);
});

test('a refusal, a credit error and a timeout each move the call to the next link', async () => {
  const refused = fake('bedrock-claude', new Error('Access to Anthropic models is not allowed for this account.'));
  const broke = fake('anthropic', new Error('Your credit balance is too low to access the Anthropic API.'));
  const slow = fake('other', new Error('The operation was aborted due to timeout'));
  const deepseek = fake('bedrock-deepseek', 'Checking.\n\n<｜DSML｜function_calls');
  const model = fallbackChain([refused, broke, slow, deepseek], () => {});
  const out = await model.doGenerate(opts);
  assert.deepEqual([refused.calls, broke.calls, slow.calls, deepseek.calls], [1, 1, 1, 1]);
  const text = out.content.find((p) => p.type === 'text');
  assert.equal(text && 'text' in text ? text.text : null, 'Checking.');
  assert.ok(out.content.some((p) => p.type === 'tool-call'), 'the tool call survives cleaning');
});

test('a single-link chain still cleans its text', async () => {
  const model = fallbackChain([fake('bedrock-nova', '<thinking>x</thinking>Your balance is 50.00 USDC.')], () => {});
  const out = await model.doGenerate(opts);
  const text = out.content.find((p) => p.type === 'text');
  assert.equal(text && 'text' in text ? text.text : null, 'Your balance is 50.00 USDC.');
});

test('when every link fails, the team is told with each link and its error, and the last error is thrown', async () => {
  const seen: { provider: string; error: string }[][] = [];
  const last = new Error('Insufficient credits');
  const model = fallbackChain([fake('anthropic', new Error('credit balance is too low')), fake('openrouter', last)], (failures) => seen.push(failures));
  await assert.rejects(model.doGenerate(opts), last);
  assert.deepEqual(seen, [[
    { provider: 'anthropic', error: 'credit balance is too low' },
    { provider: 'openrouter', error: 'Insufficient credits' },
  ]]);
});

test('the alert goes out at most once an hour', () => {
  const hour = 60 * 60 * 1000;
  assert.equal(shouldAlert(null, 1_000), true);
  assert.equal(shouldAlert(1_000, 1_000 + hour - 1), false);
  assert.equal(shouldAlert(1_000, 1_000 + hour), true);
});

test('a link refused for good is skipped for ten minutes, then tried again (owner, 15 Nov 2026)', async () => {
  let now = 0;
  const refused = fake('bedrock-claude', new Error('Access to Anthropic models is not allowed for this account.'));
  const broke = fake('anthropic', new Error('Your credit balance is too low to access the Anthropic API.'));
  const deepseek = fake('bedrock-deepseek', 'Done.');
  const model = fallbackChain([refused, broke, deepseek], () => {}, { now: () => now });
  await model.doGenerate(opts);
  now = BENCH_MS - 1;
  await model.doGenerate(opts);
  assert.deepEqual([refused.calls, broke.calls, deepseek.calls], [1, 1, 2], 'refused links are not asked again inside ten minutes');
  now = BENCH_MS;
  await model.doGenerate(opts);
  assert.deepEqual([refused.calls, broke.calls, deepseek.calls], [2, 2, 3], 'after ten minutes they get another chance');
});

test('a timeout or a busy model is never benched', async () => {
  const slow = fake('bedrock-claude', new Error('The operation was aborted due to timeout'));
  const busy = fake('anthropic', new Error('Overloaded'));
  const deepseek = fake('bedrock-deepseek', 'Done.');
  const model = fallbackChain([slow, busy, deepseek], () => {}, { now: () => 0 });
  await model.doGenerate(opts);
  await model.doGenerate(opts);
  assert.deepEqual([slow.calls, busy.calls], [2, 2]);
});

test('benched links are still the last resort, so a chain never refuses because of the bench', async () => {
  const refused = fake('bedrock-claude', new Error('Access to Anthropic models is not allowed for this account.'));
  let fail = true;
  const flaky = fake('bedrock-deepseek', 'Done.');
  const real = flaky.doGenerate.bind(flaky);
  flaky.doGenerate = (async (o: LanguageModelV3CallOptions) => {
    if (fail) { flaky.calls += 1; throw new Error('Overloaded'); }
    return real(o);
  }) as typeof flaky.doGenerate;
  const model = fallbackChain([refused, flaky], () => {}, { now: () => 0 });
  await assert.rejects(model.doGenerate(opts));
  fail = true;
  await assert.rejects(model.doGenerate(opts));
  assert.equal(refused.calls, 2, 'tried again after the healthy link failed');
});

test('a permanent refusal is told apart from a passing fault', () => {
  for (const msg of ['Access to Anthropic models is not allowed for this account.', 'Your credit balance is too low to access the Anthropic API.', 'invalid x-api-key', 'AccessDeniedException: not authorized']) {
    assert.equal(refusedForGood(new Error(msg)), true, msg);
  }
  for (const msg of ['The operation was aborted due to timeout', 'Overloaded', 'ThrottlingException: Too many requests', 'fetch failed']) {
    assert.equal(refusedForGood(new Error(msg)), false, msg);
  }
  assert.equal(refusedForGood(Object.assign(new Error('x'), { statusCode: 403 })), true);
  assert.equal(refusedForGood(Object.assign(new Error('x'), { statusCode: 429 })), false);
});

test('a private chain with the pass link refused moves to Bedrock and never reaches OpenRouter (view 89)', async () => {
  const pass = fake('anthropic', Object.assign(new Error('Anthropic refused the pass exchange (401): Authentication failed'), { statusCode: 401 }));
  const bedrock = fake('bedrock-claude', 'From Bedrock.');
  const openrouter = fake('openrouter', 'never');
  const chain = chainLinks({ bedrock, anthropic: pass, fallback: null, openrouter }, 'private');
  const out = await fallbackChain(chain, () => {}).doGenerate(opts);
  const text = out.content.find((p) => p.type === 'text');
  assert.equal(text && 'text' in text ? text.text : null, 'From Bedrock.');
  assert.deepEqual([pass.calls, bedrock.calls, openrouter.calls], [1, 1, 0]);
});
