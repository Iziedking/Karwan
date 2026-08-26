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
