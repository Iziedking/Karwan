import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SOURCES, applySourcesUpdate, mayReadOutside, sourcesOf, CONSENT_COPY_VERSION } from './consent.js';

test('outside reads are off until the person turns them on', () => {
  assert.equal(mayReadOutside(null), false);
  assert.equal(mayReadOutside({}), false);
  assert.equal(mayReadOutside({ reputationSources: { outsideReadable: true } }), true);
  assert.deepEqual(sourcesOf({}), DEFAULT_SOURCES);
});

test('an old in-market yes never opens outside reads', () => {
  assert.equal(mayReadOutside({ reputationSources: { recordReadable: true } }), false);
});

test('the outside switch saves with the new copy version and the time', () => {
  const next = applySourcesUpdate(DEFAULT_SOURCES, { outsideReadable: true }, 42);
  assert.equal(next.outsideReadable, true);
  assert.equal(next.acceptedAt, 42);
  assert.equal(next.copyVersion, 'reputation-2026-10-17');
  assert.equal(CONSENT_COPY_VERSION, 'reputation-2026-10-17');
});

test('turning outside reads off takes effect at once', () => {
  const on = applySourcesUpdate(DEFAULT_SOURCES, { outsideReadable: true }, 1);
  const off = applySourcesUpdate(on, { outsideReadable: false }, 2);
  assert.equal(mayReadOutside({ reputationSources: off }), false);
  assert.equal(off.acceptedAt, 2);
});

test('interest text is trimmed and capped at 280 characters, and does not stamp consent', () => {
  const next = applySourcesUpdate(DEFAULT_SOURCES, { interest: `  ${'x'.repeat(400)}  ` }, 1);
  assert.equal(next.interest.length, 280);
  assert.equal(next.acceptedAt, null);
});
