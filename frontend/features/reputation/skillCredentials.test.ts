import assert from 'node:assert/strict';
import test from 'node:test';
import { skillDateLabel, skillLabel } from './skillCredentials';

const COPY = { verifiedOn: 'Verified {date}', expires: 'Renews {date}' };

test('a slug reads as words, not as an id', () => {
  assert.equal(skillLabel('ui-design'), 'Ui design');
  assert.equal(skillLabel('smart_contracts'), 'Smart contracts');
  assert.equal(skillLabel('typescript'), 'Typescript');
  // A skill nobody anticipated still renders, which is the point of not
  // shipping a label map that needs an entry per skill and a translation of it.
  assert.equal(skillLabel('cross-border--logistics'), 'Cross border logistics');
});

test('a credential with an end date shows the renewal, not the issue date', () => {
  // A reader deciding whether to trust a credential cares most about whether it
  // is about to lapse.
  const label = skillDateLabel({ verifiedAt: 1_700_000_000_000, expiresAt: 1_800_000_000_000 }, COPY);
  assert.match(label, /^Renews /);
});

test('a credential with no end date shows when it was verified', () => {
  const label = skillDateLabel({ verifiedAt: 1_700_000_000_000 }, COPY);
  assert.match(label, /^Verified /);
});

test('the date is a month and a year, never a full timestamp', () => {
  const label = skillDateLabel({ verifiedAt: 1_700_000_000_000 }, COPY);
  assert.ok(!label.includes(':'), label);
  assert.match(label, /\d{4}/);
});
