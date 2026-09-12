import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSessionProof } from './sessionProof.js';

const proof = () => ({
  protocol_version: '4.0', nonce: 'nonce-12345678', environment: 'staging',
  session_id: `session_${'ab'.repeat(32)}`, user_presence_completed: true,
  responses: [{ identifier: 'selfie', issuer_schema_id: 11, expires_at_min: 2000,
    proof: ['0x01'], session_nullifier: ['0xABC', '0x02'] }],
});
const expected = { nonce: 'nonce-12345678', environment: 'staging' as const, nowSeconds: 1000 };

test('session proof keeps the replay pair together and normalizes numeric encodings', () => {
  const first = parseSessionProof(proof(), expected);
  const next = proof(); next.responses[0]!.session_nullifier = ['0x0abc', '0x0002'];
  assert.equal(parseSessionProof(next, expected).replayKey, first.replayKey);
  next.responses[0]!.session_nullifier = ['0xDEF', '0x03'];
  assert.notEqual(parseSessionProof(next, expected).replayKey, first.replayKey);
  assert.equal(first.sessionId, next.session_id);
});

test('rejects old, wrong-context, expired and weaker credential responses', () => {
  for (const patch of [
    { protocol_version: '3.0' }, { action: 'old-uniqueness-action' },
    { nonce: 'other-nonce' }, { environment: 'production' },
    { session_id: 'not-a-session' }, { user_presence_completed: false },
    { responses: [] }, { responses: [{ ...proof().responses[0], identifier: 'proof_of_human' }] },
    { responses: [{ ...proof().responses[0], issuer_schema_id: 1 }] },
    { responses: [{ ...proof().responses[0], expires_at_min: 999 }] },
    { responses: [{ ...proof().responses[0], session_nullifier: ['0x01'] }] },
  ]) assert.throws(() => parseSessionProof({ ...proof(), ...patch }, expected));
  assert.throws(() => parseSessionProof(proof(), { ...expected, sessionId: `session_${'cd'.repeat(32)}` }));
});
