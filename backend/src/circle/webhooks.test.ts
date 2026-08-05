import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/// The webhook key must be fetched by the KEY id, never the subscription id.
///
/// This is a regression guard for a bug that cost an entire feature without ever
/// looking broken. Production logged, on every single delivery:
///
///   circle webhook public key fetch failed  404  subscriptionId c24aad3e-...
///   circle webhook: signature invalid       keyId 879dc113-...
///
/// The lookup ran against CIRCLE_WEBHOOK_SUBSCRIPTION_ID, but the endpoint behind
/// the SDK call is GET /v2/notifications/publicKey/{keyId}, so it 404'd forever.
/// With no key, every webhook failed verification, no deposit was ever credited,
/// and a real 20 USDC deposit sat on Ethereum while the UI said it was waiting.
///
/// The SDK invites the mistake: the parameter is typed `subscriptionId: string`
/// while the value has to be the key id from the header. So the guard is a source
/// assertion rather than a behavioural one. Calling the real API needs
/// credentials, and mocking the SDK would prove only that the mock was wired.
///
///   npx tsx --test src/circle/webhooks.test.ts

const src = readFileSync(join(import.meta.dirname, 'webhooks.ts'), 'utf8');

/// Comments explain the bug by name, so a bare substring search would match the
/// explanation and fail on a correct file. Assert against code only.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('///'))
  .join('\n');

test('the public key is fetched with the key id from the header', () => {
  assert.match(
    code,
    /getNotificationSignature\(keyId\)/,
    'getNotificationSignature must receive the X-Circle-Key-Id value',
  );
});

test('verification never reads the subscription id', () => {
  // The subscription id is the operator's on/off switch on the route. If it
  // reappears here, someone has reintroduced the 404.
  assert.doesNotMatch(
    code,
    /CIRCLE_WEBHOOK_SUBSCRIPTION_ID/,
    'webhooks.ts must not consult the subscription id to verify a signature',
  );
});

test('a delivery with no key id is refused rather than guessed at', async () => {
  const { verifyWebhookSignature } = await import('./webhooks.js');
  // No credentials are needed: this must fail before any network call.
  assert.equal(await verifyWebhookSignature('{}', 'c2ln', undefined), false);
});

test('a delivery with no signature is refused', async () => {
  const { verifyWebhookSignature } = await import('./webhooks.js');
  assert.equal(await verifyWebhookSignature('{}', undefined, 'some-key-id'), false);
});

test('the key cache is keyed by id, not a single slot', () => {
  // One slot plus "refetch when the header differs" works with one key and
  // thrashes on every delivery once two are in rotation.
  assert.match(code, /keyCache\s*=\s*new Map/, 'expected a per-key-id cache');
});
