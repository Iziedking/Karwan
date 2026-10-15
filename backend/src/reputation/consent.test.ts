import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SOURCES, applySourcesUpdate, mayReadRecord, sourcesOf, CONSENT_COPY_VERSION } from './consent.js';

test('nobody is readable by default', () => {
  assert.equal(mayReadRecord(null), false);
  assert.equal(mayReadRecord({}), false);
  assert.deepEqual(sourcesOf({}), DEFAULT_SOURCES);
});

test('turning consent on stamps the time and copy version', () => {
  const next = applySourcesUpdate(DEFAULT_SOURCES, { recordReadable: true }, 42);
  assert.equal(next.recordReadable, true);
  assert.equal(next.acceptedAt, 42);
  assert.equal(next.copyVersion, CONSENT_COPY_VERSION);
  assert.equal(mayReadRecord({ reputationSources: next }), true);
});

test('turning consent off takes effect at once', () => {
  const on = applySourcesUpdate(DEFAULT_SOURCES, { recordReadable: true }, 1);
  const off = applySourcesUpdate(on, { recordReadable: false }, 2);
  assert.equal(mayReadRecord({ reputationSources: off }), false);
  assert.equal(off.acceptedAt, 2);
});

test('interest text is trimmed and capped at 280 characters, and does not stamp consent', () => {
  const next = applySourcesUpdate(DEFAULT_SOURCES, { interest: `  ${'x'.repeat(400)}  ` }, 1);
  assert.equal(next.interest.length, 280);
  assert.equal(next.acceptedAt, null);
});
