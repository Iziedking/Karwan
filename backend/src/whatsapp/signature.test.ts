import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { verifyMetaSignature } from './signature.js';

const secret = 'test-secret';
const body = '{"object":"whatsapp_business_account"}';
const good = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

test('accepts the signature Meta computes', () => {
  assert.equal(verifyMetaSignature(body, good, secret), true);
});

test('rejects a tampered body', () => {
  assert.equal(verifyMetaSignature(body + ' ', good, secret), false);
});

test('rejects a missing or malformed header', () => {
  assert.equal(verifyMetaSignature(body, undefined, secret), false);
  assert.equal(verifyMetaSignature(body, 'sha1=abc', secret), false);
  assert.equal(verifyMetaSignature(body, 'sha256=zz', secret), false);
});
