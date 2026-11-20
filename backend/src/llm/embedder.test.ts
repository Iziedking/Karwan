import assert from 'node:assert/strict';
import { test } from 'node:test';
import { embedTexts, type EmbedFn } from './embedder.js';

/// The meaning-vector embedder (view 95 phase 2), on a stub model: batches of at
/// most 96, null on any failure, and no text ever reaches the logs.
///
///   npx tsx --test src/llm/embedder.test.ts

const quiet = { info: () => undefined, warn: () => undefined };
const echo: EmbedFn = async (texts) => texts.map((t) => [t.length, 1, 0]);

test('texts go in calls of at most 96', async () => {
  const sizes: number[] = [];
  const embed: EmbedFn = async (texts, inputType, signal) => {
    sizes.push(texts.length);
    return echo(texts, inputType, signal);
  };
  const out = await embedTexts(Array.from({ length: 200 }, (_, i) => `text ${i}`), 'search_document', { embed, log: quiet });
  assert.deepEqual(sizes, [96, 96, 8]);
  assert.equal(out?.length, 200);
  assert.ok(out?.[0] instanceof Float32Array);
});

test('the input type reaches the model', async () => {
  let seen = '';
  await embedTexts(['tailor'], 'search_query', { embed: async (t, type) => ((seen = type), t.map(() => [1, 0])), log: quiet });
  assert.equal(seen, 'search_query');
});

test('an error returns null', async () => {
  const out = await embedTexts(['tailor'], 'search_query', { embed: async () => { throw new Error('ThrottlingException'); }, log: quiet });
  assert.equal(out, null);
});

test('a model that never answers returns null after the time limit', async () => {
  const started = Date.now();
  const out = await embedTexts(['tailor'], 'search_query', { embed: () => new Promise(() => undefined), timeoutMs: 50, log: quiet });
  assert.equal(out, null);
  assert.ok(Date.now() - started < 1000);
});

test('a reply of the wrong length or with uneven vectors returns null', async () => {
  assert.equal(await embedTexts(['a', 'b'], 'search_query', { embed: async () => [[1, 0]], log: quiet }), null);
  assert.equal(await embedTexts(['a', 'b'], 'search_query', { embed: async () => [[1, 0], [1, 0, 0]], log: quiet }), null);
});

test('nothing to embed makes no call', async () => {
  let calls = 0;
  const out = await embedTexts([], 'search_query', { embed: async () => ((calls += 1), []), log: quiet });
  assert.deepEqual(out, []);
  assert.equal(calls, 0);
});

test('the text never reaches the logger', async () => {
  const lines: string[] = [];
  const log = { info: (o: unknown, m?: string) => void lines.push(JSON.stringify(o) + (m ?? '')), warn: (o: unknown, m?: string) => void lines.push(JSON.stringify(o) + (m ?? '')) };
  const secret = 'someone to sew aso ebi for my wedding';
  await embedTexts([secret], 'search_query', { embed: echo, log });
  await embedTexts([secret], 'search_query', { embed: async () => { throw new Error(`bad input: ${secret}`); }, log });
  assert.ok(lines.length >= 2);
  for (const line of lines) assert.ok(!line.includes('aso ebi'), line);
});
