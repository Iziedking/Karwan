import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyProviderCircuitObservation,
  providerCircuitIsAvailable,
  selectRegisteredProvider,
  type EvidenceProviderRegistration,
} from './providerRegistry.js';

function registration(overrides: Partial<EvidenceProviderRegistration> = {}): EvidenceProviderRegistration {
  return {
    providerId: 'provider-1',
    providerVersion: '2026-08-24',
    source: 'x402',
    endpoint: 'https://provider.example/evidence',
    network: 'base-sepolia',
    asset: 'USDC',
    payTo: '0x2222222222222222222222222222222222222222',
    priceUsdc: '0.01',
    expectedReliability: 90,
    responseLimitBytes: 10_000,
    claims: ['completed-transactions'],
    provenanceRequirements: ['provider-receipt'],
    enabled: true,
    circuit: {
      state: 'closed',
      consecutiveFailures: 0,
      cooldownSeconds: 60,
      failureThreshold: 2,
    },
    ...overrides,
  };
}

const need = {
  needId: 'need-1',
  claim: 'completed-transactions' as const,
  subject: 'seller-1',
  decision: 'ranking' as const,
  requiredFreshnessSeconds: 3600,
  minimumReliability: 80,
  maximumPriceUsdc: '0.02',
  mandateVersion: 1,
  policyVersion: 'policy-1',
  expiresAtUnix: 10_000,
};

test('provider registry filters disabled, unsupported, and open providers', () => {
  const base = registration();
  assert.equal(selectRegisteredProvider(base, need, 100, ['provider-receipt']).allowed, true);
  assert.equal(selectRegisteredProvider({ ...base, enabled: false }, need, 100).reason, 'DISABLED');
  assert.equal(selectRegisteredProvider({ ...base, claims: ['capacity'] }, need, 100).reason, 'CLAIM_UNSUPPORTED');
  assert.equal(
    selectRegisteredProvider({ ...base, circuit: { ...base.circuit, state: 'open', openedAtUnix: 100 } }, need, 120).reason,
    'CIRCUIT_OPEN',
  );
  assert.equal(
    selectRegisteredProvider({ ...base, circuit: { ...base.circuit, state: 'open', openedAtUnix: 100 } }, need, 160).allowed,
    true,
  );
});

test('provider circuit opens after failures and closes after a successful probe', () => {
  const base = registration();
  const first = applyProviderCircuitObservation(base, { success: false, nowUnix: 100 });
  assert.equal(first.circuit.state, 'closed');
  const opened = applyProviderCircuitObservation(first, { success: false, nowUnix: 101 });
  assert.equal(opened.circuit.state, 'open');
  assert.equal(providerCircuitIsAvailable(opened, 120), false);
  assert.equal(providerCircuitIsAvailable(opened, 161), true);
  const closed = applyProviderCircuitObservation({ ...opened, circuit: { ...opened.circuit, state: 'half_open' } }, { success: true, nowUnix: 162 });
  assert.equal(closed.circuit.state, 'closed');
  assert.equal(closed.circuit.consecutiveFailures, 0);
});
