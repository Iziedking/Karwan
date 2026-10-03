import assert from 'node:assert/strict';
import test from 'node:test';
import { moneyInvariantInstallFailureIsFatal, runtimeSafetyErrors } from './configSafety.js';

test('production refuses to run without durable PostgreSQL persistence', () => {
  assert.equal(runtimeSafetyErrors({ nodeEnv: 'production' }).length, 2);
  assert.deepEqual(
    runtimeSafetyErrors({
      nodeEnv: 'production',
      databaseUrl: 'postgresql://db/karwan',
      sessionSecret: 'a-unique-production-session-secret-with-32-characters',
    }),
    [],
  );
});

test('production refuses a missing, short, or documented placeholder session secret', () => {
  const base = { nodeEnv: 'production' as const, databaseUrl: 'postgresql://db/karwan' };
  assert.equal(runtimeSafetyErrors(base).length, 1);
  assert.equal(runtimeSafetyErrors({ ...base, sessionSecret: 'too-short' }).length, 1);
  assert.equal(
    runtimeSafetyErrors({
      ...base,
      sessionSecret: 'dev-secret-change-me-please-32-chars-min',
    }).length,
    1,
  );
});

test('local and test environments retain the explicit flat-file fallback', () => {
  assert.deepEqual(runtimeSafetyErrors({ nodeEnv: 'development' }), []);
  assert.deepEqual(runtimeSafetyErrors({ nodeEnv: 'test' }), []);
});

test('critical money invariant installation fails closed only in production', () => {
  assert.equal(moneyInvariantInstallFailureIsFatal('production'), true);
  assert.equal(moneyInvariantInstallFailureIsFatal('development'), false);
  assert.equal(moneyInvariantInstallFailureIsFatal('test'), false);
});

test('mainnet production refuses passkey recovery without a KMS key', () => {
  const base = { nodeEnv: 'production' as const, databaseUrl: 'postgresql://db/karwan', sessionSecret: 'a-unique-production-session-secret-with-32-characters' };
  assert.deepEqual(runtimeSafetyErrors({ ...base, arcNetwork: 'mainnet', recoveryEnabled: true }), [
    'RECOVERY_KMS_KEY_ID is required when RECOVERY_ENABLED is on mainnet in production',
  ]);
  assert.deepEqual(runtimeSafetyErrors({ ...base, arcNetwork: 'mainnet', recoveryEnabled: true, recoveryKmsKeyId: 'alias/karwan-recovery' }), []);
  assert.deepEqual(runtimeSafetyErrors({ ...base, arcNetwork: 'testnet', recoveryEnabled: true }), []);
});

test('production refuses World ID in staging, which the real World App cannot complete', () => {
  const base = { nodeEnv: 'production' as const, databaseUrl: 'postgresql://db/karwan', sessionSecret: 'a-unique-production-session-secret-with-32-characters' };
  assert.deepEqual(runtimeSafetyErrors({ ...base, worldIdEnabled: true, worldIdEnvironment: 'staging' }), [
    'WORLD_ID_ENVIRONMENT must be production when WORLD_ID_ENABLED is on in production; staging only works with the World ID Simulator',
  ]);
  assert.deepEqual(runtimeSafetyErrors({ ...base, worldIdEnabled: true, worldIdEnvironment: 'production' }), []);
  assert.deepEqual(runtimeSafetyErrors({ ...base, worldIdEnabled: false, worldIdEnvironment: 'staging' }), []);
  assert.deepEqual(runtimeSafetyErrors({ nodeEnv: 'development', worldIdEnabled: true, worldIdEnvironment: 'staging' }), []);
});
