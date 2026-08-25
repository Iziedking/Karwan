import assert from 'node:assert/strict';
import test from 'node:test';
import { runFailureInjectionSimulation } from './failureInjection.js';
import { runReliabilitySimulation } from './reliability.js';

test('deterministic reliability simulator preserves no-duplicate and no-stale-authority invariants', () => {
  const report = runReliabilitySimulation();
  assert.equal(report.scenarios.length, 21);
  assert.equal(report.passed, true);
  assert.equal(Object.values(report.invariants).every(Boolean), true);
});

test('failure-injection simulator proves checkpoint recovery, claim safety, event dedupe, and bounded dead letters', async () => {
  const report = await runFailureInjectionSimulation();
  const replay = await runFailureInjectionSimulation();
  assert.equal(report.scenarios.length, 51);
  assert.equal(report.scenarios.includes('minimum evidence threshold blocks a high-score candidate'), true);
  assert.equal(report.scenarios.includes('strong match label requires settled referenced evidence'), true);
  assert.equal(report.scenarios.includes('Circle timeout before provider ID remains unknown without resubmission'), true);
  assert.equal(report.scenarios.includes('cooldown expires without material change'), true);
  assert.equal(report.scenarios.includes('approval expiry and replay are rejected'), true);
  assert.equal(report.scenarios.includes('manual dead-letter replay resets a shadow task once'), true);
  assert.equal(report.scenarios.includes('fresh evidence is reused across re-engagement'), true);
  assert.equal(report.scenarios.includes('x402 signed request timeout remains uncertain without resubmission'), true);
  assert.equal(report.scenarios.includes('pre-funding authorization precedes acceptance without V2 mutation'), true);
  assert.equal(report.scenarios.includes('approved stake resumes into a reviewed operation without mutating approval state'), true);
  assert.equal(report.passed, true);
  assert.equal(Object.values(report.invariants).every(Boolean), true);
  assert.deepEqual(replay, report);
});
