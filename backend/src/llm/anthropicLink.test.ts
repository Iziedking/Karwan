import assert from 'node:assert/strict';
import test from 'node:test';
import { generateText } from 'ai';
import { anthropicLink } from './anthropicLink.js';
import { PassError, type PassKeeper } from './anthropicPass.js';
import { refusedForGood } from './chain.js';

/// The Anthropic link with a pass or a key (view 89).
///
///   npx tsx --test src/llm/anthropicLink.test.ts

const MODEL = 'claude-haiku-4-5-20251001';

/// A Messages API that answers "ok" and records the headers of each request.
function messagesApi() {
  const headers: Array<Record<string, string>> = [];
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    headers.push(Object.fromEntries(new Headers(init?.headers).entries()));
    return new Response(
      JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: MODEL,
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return { fetchFn, headers };
}

const keeper = (get: () => Promise<string>): PassKeeper => ({ get, expiresAt: () => null });

test('with a pass, the request carries the bearer pass and no x-api-key', async () => {
  const api = messagesApi();
  const link = anthropicLink(
    { kind: 'pass', settings: { ruleId: 'fdrl_x', organizationId: 'org-1' }, region: 'ca-central-1' },
    { keeper: keeper(async () => 'sk-ant-oat01-p'), fetch: api.fetchFn },
  );
  assert.ok(link);
  assert.equal(link.how, 'pass');
  const out = await generateText({ model: link.provider(MODEL), prompt: 'hi', maxRetries: 0 });
  assert.equal(out.text, 'ok');
  assert.equal(api.headers[0]!.authorization, 'Bearer sk-ant-oat01-p');
  assert.equal('x-api-key' in api.headers[0]!, false);
});

test('with a key, the request carries x-api-key and no bearer', async () => {
  const api = messagesApi();
  const link = anthropicLink({ kind: 'key', apiKey: 'sk-ant-api03-k' }, { fetch: api.fetchFn });
  assert.ok(link);
  assert.equal(link.how, 'key');
  assert.equal(link.keeper, null);
  await generateText({ model: link.provider(MODEL), prompt: 'hi', maxRetries: 0 });
  assert.equal(api.headers[0]!['x-api-key'], 'sk-ant-api03-k');
  assert.equal('authorization' in api.headers[0]!, false);
});

test('no auth means no link', () => {
  assert.equal(anthropicLink(null), null);
});

test('a refused pass surfaces as an error the chain rests on', async () => {
  const api = messagesApi();
  const link = anthropicLink(
    { kind: 'pass', settings: { ruleId: 'fdrl_x', organizationId: 'org-1' }, region: 'ca-central-1' },
    { keeper: keeper(async () => { throw new PassError('Anthropic refused the pass exchange (401): Authentication failed', 401); }), fetch: api.fetchFn },
  );
  assert.ok(link);
  const err = await generateText({ model: link.provider(MODEL), prompt: 'hi', maxRetries: 0 }).then(() => null, (e: unknown) => e);
  assert.ok(err, 'the call failed');
  assert.equal(refusedForGood(err), true);
  assert.equal(api.headers.length, 0, 'nothing reached Anthropic without a pass');
});
