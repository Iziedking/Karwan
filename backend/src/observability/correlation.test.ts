import assert from 'node:assert/strict';
import test from 'node:test';
import { correlationIdFromHeader, isCorrelationId } from './correlation.js';

test('preserves a bounded opaque correlation id', () => {
  assert.equal(correlationIdFromHeader('  request:abc-123  '), 'request:abc-123');
  assert.equal(isCorrelationId('request:abc-123'), true);
});

test('replaces missing, malformed, and oversized ids without exposing input', () => {
  const generated = () => 'generated-id';
  assert.equal(correlationIdFromHeader(undefined, generated), 'generated-id');
  assert.equal(correlationIdFromHeader('contains spaces', generated), 'generated-id');
  assert.equal(correlationIdFromHeader(`${'a'.repeat(129)}`, generated), 'generated-id');
  assert.equal(isCorrelationId('contains spaces'), false);
});
