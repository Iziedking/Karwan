import assert from 'node:assert/strict';
import test from 'node:test';
import { anthropicProvider, assistantProvidersFrom, requestHeaders } from './assistant.js';
import { privateAssistantProviders } from '../assistant/safety.js';

/// The assistant's own provider list asks Claude at Anthropic first, with a
/// pass when one is set up (view 89).
///
///   npx tsx --test src/routes/assistantProviders.test.ts

const MODEL = 'claude-haiku-4-5-20251001';
const bedrock = { name: 'bedrock', url: '', headers: {}, model: 'b', kind: 'bedrock' as const };
const fallback = { name: 'bedrock-fallback', url: '', headers: {}, model: 'd', kind: 'bedrock' as const };
const openrouter = { name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', headers: {}, model: 'o', kind: 'openai' as const };

test('the assistant asks Claude at Anthropic first, then Bedrock, the backup and OpenRouter', () => {
  const anthropic = anthropicProvider(MODEL, { kind: 'key', apiKey: 'k' });
  assert.deepEqual(assistantProvidersFrom({ anthropic, bedrock, fallback, openrouter }).map((p) => p.name), ['anthropic', 'bedrock', 'bedrock-fallback', 'openrouter']);
  assert.deepEqual(assistantProvidersFrom({ anthropic: null, bedrock: null, fallback, openrouter: null }).map((p) => p.name), ['bedrock-fallback']);
});

test('signed-in chats still drop OpenRouter', () => {
  const anthropic = anthropicProvider(MODEL, { kind: 'key', apiKey: 'k' });
  const list = privateAssistantProviders(assistantProvidersFrom({ anthropic, bedrock, fallback, openrouter }));
  assert.deepEqual(list.map((p) => p.name), ['anthropic', 'bedrock', 'bedrock-fallback']);
});

test('with a pass, the request sends the bearer pass and no key header', async () => {
  const p = anthropicProvider(MODEL, { kind: 'pass', keeper: { get: async () => 'sk-ant-oat01-p', expiresAt: () => null } });
  assert.equal(p.url, 'https://api.anthropic.com/v1/messages');
  const h = await requestHeaders(p);
  assert.equal(h.authorization, 'Bearer sk-ant-oat01-p');
  assert.equal('x-api-key' in h, false);
  assert.equal(h['anthropic-version'], '2023-06-01');
  assert.equal(h['content-type'], 'application/json');
});

test('with a key, the request sends x-api-key and no bearer', async () => {
  const h = await requestHeaders(anthropicProvider(MODEL, { kind: 'key', apiKey: 'sk-ant-api03-k' }));
  assert.equal(h['x-api-key'], 'sk-ant-api03-k');
  assert.equal('authorization' in h, false);
});

test('the pass is asked for at request time, not when the list is built', async () => {
  let asked = 0;
  const p = anthropicProvider(MODEL, { kind: 'pass', keeper: { get: async () => { asked += 1; return `p${asked}`; }, expiresAt: () => null } });
  assert.equal(asked, 0);
  assert.equal((await requestHeaders(p)).authorization, 'Bearer p1');
  assert.equal((await requestHeaders(p)).authorization, 'Bearer p2');
});
