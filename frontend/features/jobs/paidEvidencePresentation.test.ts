import assert from 'node:assert/strict';
import test from 'node:test';
import {
  presentPaidEvidenceReceipt,
  shortenEvidenceId,
} from './paidEvidencePresentation';

const fixtures = [
  { name: 'legacy payment only', input: {}, state: 'payment_only' as const },
  {
    name: 'durable snapshot recorded',
    input: { evidenceId: 'legacy-evidence-snapshot:abcdef0123456789' },
    state: 'snapshot_recorded' as const,
  },
] as const;

for (const fixture of fixtures) {
  test(`characterizes ${fixture.name}`, () => {
    const result = presentPaidEvidenceReceipt(fixture.input);
    assert.equal(result.state, fixture.state);
    assert.equal(
      result.evidenceId,
      'evidenceId' in fixture.input ? fixture.input.evidenceId : null,
    );
  });
}

test('keeps the full evidence id recoverable while shortening the display value', () => {
  const evidenceId = 'legacy-evidence-snapshot:0123456789abcdef0123456789abcdef';
  const result = presentPaidEvidenceReceipt({ evidenceId });
  assert.equal(result.evidenceId, evidenceId);
  assert.equal(result.displayEvidenceId, 'legacy-evidenc…abcdef');
  assert.equal(shortenEvidenceId('short-id'), 'short-id');
});

test('defaults legacy paid rows to the truthful provider, claim, and impact', () => {
  const result = presentPaidEvidenceReceipt({});
  assert.deepEqual(
    {
      providerId: result.providerId,
      claim: result.claim,
      decisionImpact: result.decisionImpact,
    },
    {
      providerId: 'karwan-credit-passport',
      claim: 'completed-transactions',
      decisionImpact: 'legacy_match_unchanged',
    },
  );
});

test('preserves explicit receipt metadata without changing presentation authority', () => {
  const result = presentPaidEvidenceReceipt({
    providerId: 'karwan-credit-passport',
    claim: 'completed-transactions',
    decisionImpact: 'legacy_match_unchanged',
  });
  assert.equal(result.state, 'payment_only');
  assert.equal(result.decisionImpact, 'legacy_match_unchanged');
});
