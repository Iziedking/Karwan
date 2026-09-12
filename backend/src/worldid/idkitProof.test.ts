import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWorldIdResult } from './idkitProof.js';

test('parseWorldIdResult accepts a staging nullifier and normalizes it', () => {
  const base = {
    protocol_version: '4.0',
    nonce: 'nonce-12345678',
    action: 'karwan-human-research-2026',
    environment: 'staging' as const,
    responses: [{ nullifier: '0xABC' }],
  };

  assert.deepEqual(parseWorldIdResult({ result: base, expectedAction: base.action, expectedEnvironment: 'staging' }), {
    nullifiers: ['0xabc'], nonce: base.nonce, action: base.action, environment: 'staging',
  });
});

test('parseWorldIdResult rejects an action or nonce bound to a different request', () => {
  const base = {
    protocol_version: '4.0', nonce: 'nonce-12345678', action: 'karwan-human-research-2026',
    environment: 'staging' as const, responses: [{ nullifier: '0xABC' }],
  };
  assert.throws(() => parseWorldIdResult({ result: base, expectedAction: 'other', expectedEnvironment: 'staging' }), /action mismatch/);
  assert.throws(() => parseWorldIdResult({ result: base, expectedAction: base.action, expectedEnvironment: 'staging', expectedNonce: 'other' }), /nonce mismatch/);
});

test('parseWorldIdResult rejects a proof without a valid nullifier', () => {
  const base = {
    nonce: 'nonce-12345678', action: 'karwan-human-research-2026', environment: 'staging' as const,
  };
  assert.throws(() => parseWorldIdResult({ result: { ...base, responses: [] }, expectedAction: base.action, expectedEnvironment: 'staging' }), /nullifier/);
});

test('uniqueness endpoint cannot consume a session proof or flatten its replay pair', () => {
  const base = { nonce: 'nonce-12345678', action: 'research', environment: 'staging' as const };
  for (const result of [
    { ...base, session_id: 'session_ab', responses: [{ nullifier: '0xabc' }] },
    { ...base, responses: [{ nullifier: '0xabc', session_nullifier: ['0x1', '0x2'] }] },
  ]) {
    assert.throws(() => parseWorldIdResult({ result, expectedAction: 'research', expectedEnvironment: 'staging' }), /authenticated deal endpoint/);
  }
});
