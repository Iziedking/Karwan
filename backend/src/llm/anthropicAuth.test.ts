import assert from 'node:assert/strict';
import test from 'node:test';
import { anthropicAuthFrom } from './anthropicAuth.js';

/// How the server reaches Claude at Anthropic: a pass, a key, or not at all
/// (view 89).
///
///   npx tsx --test src/llm/anthropicAuth.test.ts

test('rule and organization together choose the pass, even with a key set', () => {
  assert.deepEqual(
    anthropicAuthFrom({ ruleId: 'fdrl_x', organizationId: 'org-1', workspaceId: 'wrkspc_t', serviceAccountId: 'svac_1', apiKey: 'sk-ant-api03-old', awsRegion: 'ca-central-1' }),
    { kind: 'pass', settings: { ruleId: 'fdrl_x', organizationId: 'org-1', workspaceId: 'wrkspc_t', serviceAccountId: 'svac_1' }, region: 'ca-central-1' },
  );
});

test('the note region is the STS setting, else the AWS region, else us-east-1', () => {
  const base = { ruleId: 'fdrl_x', organizationId: 'org-1' };
  assert.equal((anthropicAuthFrom({ ...base, stsRegion: 'eu-west-1', awsRegion: 'ca-central-1' }) as { region: string }).region, 'eu-west-1');
  assert.equal((anthropicAuthFrom({ ...base, awsRegion: 'ca-central-1' }) as { region: string }).region, 'ca-central-1');
  assert.equal((anthropicAuthFrom(base) as { region: string }).region, 'us-east-1');
});

test('optional ids are left out when not set', () => {
  const auth = anthropicAuthFrom({ ruleId: 'fdrl_x', organizationId: 'org-1' });
  assert.deepEqual(auth, { kind: 'pass', settings: { ruleId: 'fdrl_x', organizationId: 'org-1' }, region: 'us-east-1' });
});

test('a key alone chooses the key', () => {
  assert.deepEqual(anthropicAuthFrom({ apiKey: 'sk-ant-api03-k' }), { kind: 'key', apiKey: 'sk-ant-api03-k' });
});

test('nothing set means no Anthropic link', () => {
  assert.equal(anthropicAuthFrom({}), null);
});

test('half the pass settings with a key falls back to the key', () => {
  assert.deepEqual(anthropicAuthFrom({ ruleId: 'fdrl_x', apiKey: 'sk-ant-api03-k' }), { kind: 'key', apiKey: 'sk-ant-api03-k' });
});
