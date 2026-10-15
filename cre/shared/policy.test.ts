import { describe, expect, test } from 'bun:test';
import { fingerprint } from './canonical.js';
import { REPLAY_POLICY, parsePolicy, policyFingerprint } from './policy.js';
import { proofFingerprint, referenceSchema } from './reference.js';

const policy = () => ({
  policy: REPLAY_POLICY,
  repository: { owner: 'acme', name: 'billing', id: 123456 },
  baseBranch: 'main',
  delivery: 'pull',
  setup: 'npm ci',
  items: [
    { id: 'i1', title: 'Invoices export to CSV', run: 'npm test -- export.spec.ts', required: true },
    { id: 'i2', title: 'Login rate limit', run: 'npm test -- auth.spec.ts', required: true },
  ],
  partialAt: 1,
  runner: {
    repository: 'karwan-xyz/karwan-replay',
    workflow: '.github/workflows/replay.yml',
    blobSha: 'a'.repeat(40),
  },
  timeoutMinutes: 20,
});

describe('acceptance policy', () => {
  test('the agreed example parses and fingerprints canonically', () => {
    const p = parsePolicy(policy(), { partialAllowed: true });
    expect(policyFingerprint(p)).toBe(fingerprint(policy()));
  });

  test('needs 1 to 12 items, unique ids, and at least one required', () => {
    expect(() => parsePolicy({ ...policy(), items: [] }, { partialAllowed: true })).toThrow();
    const thirteen = Array.from({ length: 13 }, (_, i) => ({ id: `i${i}`, title: 't', run: 'x', required: true }));
    expect(() => parsePolicy({ ...policy(), items: thirteen }, { partialAllowed: false })).toThrow();
    const dup = [policy().items[0], policy().items[0]];
    expect(() => parsePolicy({ ...policy(), items: dup, partialAt: null }, { partialAllowed: false })).toThrow('POLICY_DUPLICATE_ITEM');
    const optionalOnly = [{ ...policy().items[0], required: false }];
    expect(() => parsePolicy({ ...policy(), items: optionalOnly, partialAt: null }, { partialAllowed: false })).toThrow('POLICY_NO_REQUIRED_ITEM');
  });

  test('a command is one printable line of at most 500 characters', () => {
    const withNewline = [{ ...policy().items[0], run: 'npm test\nrm -rf /' }];
    expect(() => parsePolicy({ ...policy(), items: withNewline, partialAt: null }, { partialAllowed: false })).toThrow();
    const tooLong = [{ ...policy().items[0], run: 'x'.repeat(501) }];
    expect(() => parsePolicy({ ...policy(), items: tooLong, partialAt: null }, { partialAllowed: false })).toThrow();
  });

  test('the partial line needs a partial share and stays below the required count', () => {
    expect(() => parsePolicy(policy(), { partialAllowed: false })).toThrow('POLICY_PARTIAL_LINE');
    expect(() => parsePolicy({ ...policy(), partialAt: 2 }, { partialAllowed: true })).toThrow('POLICY_PARTIAL_LINE');
    expect(parsePolicy({ ...policy(), partialAt: null }, { partialAllowed: false }).partialAt).toBeNull();
  });

  test('timeout is 5 to 60 minutes', () => {
    expect(() => parsePolicy({ ...policy(), timeoutMinutes: 4 }, { partialAllowed: true })).toThrow();
    expect(() => parsePolicy({ ...policy(), timeoutMinutes: 61 }, { partialAllowed: true })).toThrow();
  });

  test('unknown keys and an unpinned runner are refused', () => {
    expect(() => parsePolicy({ ...policy(), extra: 1 }, { partialAllowed: true })).toThrow();
    const runner = { ...policy().runner, blobSha: 'main' };
    expect(() => parsePolicy({ ...policy(), runner }, { partialAllowed: true })).toThrow();
  });
});

describe('delivery reference', () => {
  const reference = { repository: { owner: 'acme', name: 'billing', id: 123456 }, pull: 42, sha: 'b'.repeat(40) };

  test('fingerprints canonically', () => {
    expect(proofFingerprint(reference)).toBe(fingerprint(reference));
  });

  test('refuses a sha that is not 40 lowercase hex', () => {
    expect(() => referenceSchema.parse({ ...reference, sha: 'B'.repeat(40) })).toThrow();
    expect(() => referenceSchema.parse({ ...reference, sha: 'b'.repeat(39) })).toThrow();
  });
});
