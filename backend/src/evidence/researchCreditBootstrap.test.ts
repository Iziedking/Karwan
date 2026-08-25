import assert from 'node:assert/strict';
import test from 'node:test';
import {
  legacyCreditToMicros,
  planResearchCreditBootstrap,
} from './researchCreditBootstrap.js';

const owner = '0x1111111111111111111111111111111111111111';

test('legacy credit converts to exact micro-USDC without mutating either ledger', () => {
  assert.equal(legacyCreditToMicros(1.5), '1500000');
  assert.equal(legacyCreditToMicros(0.007), '7000');
  assert.throws(() => legacyCreditToMicros(Number.NaN), /invalid legacy research credit/);
});

test('active legacy credit with no ledger requires explicit bootstrap', () => {
  const plan = planResearchCreditBootstrap({
    owner,
    legacy: { owner, active: true, creditUsdc: 1.5, updatedAt: 100 },
  });
  assert.deepEqual(plan, {
    owner, action: 'bootstrap-required', reason: 'LEDGER_ACCOUNT_MISSING',
    legacyActive: true, legacyCreditMicros: '1500000', legacyUpdatedAt: 100,
  });
});

test('aligned ledger is reported but remains read-only', () => {
  const plan = planResearchCreditBootstrap({
    owner,
    legacy: { owner, active: true, creditUsdc: 1.5, updatedAt: 100 },
    ledger: { owner, balanceMicros: '1500000', reservedMicros: '0', version: 1, updatedAt: 110 },
  });
  assert.equal(plan.action, 'ledger-aligned');
  assert.equal(plan.reason, 'ALIGNED_READ_ONLY');
  assert.equal(plan.ledgerVersion, 1);
});

test('reserved or mismatched ledger credit requires review, never auto-merge', () => {
  const reserved = planResearchCreditBootstrap({
    owner,
    legacy: { owner, active: true, creditUsdc: 1.5, updatedAt: 100 },
    ledger: { owner, balanceMicros: '1500000', reservedMicros: '1000', version: 2, updatedAt: 120 },
  });
  assert.equal(reserved.action, 'review-required');
  assert.equal(reserved.reason, 'LEDGER_HAS_RESERVED_CREDIT');
  const mismatch = planResearchCreditBootstrap({
    owner,
    legacy: { owner, active: true, creditUsdc: 1.5, updatedAt: 100 },
    ledger: { owner, balanceMicros: '500000', reservedMicros: '0', version: 3, updatedAt: 130 },
  });
  assert.equal(mismatch.reason, 'LEGACY_LEDGER_MISMATCH');
});

test('missing or inactive legacy profile never causes a ledger write', () => {
  assert.equal(planResearchCreditBootstrap({ owner }).reason, 'LEGACY_PROFILE_MISSING');
  assert.equal(planResearchCreditBootstrap({
    owner,
    legacy: { owner, active: false, creditUsdc: 0, updatedAt: 100 },
  }).action, 'legacy-inactive');
  assert.equal(planResearchCreditBootstrap({
    owner,
    legacy: { owner, active: false, creditUsdc: 1, updatedAt: 100 },
  }).reason, 'LEGACY_STATE_INCONSISTENT');
});
