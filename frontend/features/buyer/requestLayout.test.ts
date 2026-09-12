import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./components/PostJobForm.tsx', import.meta.url), 'utf8');

test('request starts with its brief; optional controls follow budget and deadline', () => {
  const form = source.slice(source.indexOf('<form ref='));
  const options = form.indexOf('<details open={optionsOpen}');
  assert.ok(options > form.indexOf('label={t.sectionTerms.deadlineLabel}'));
  assert.ok(form.indexOf('label={c.tolerance}') > options);
  assert.ok(form.indexOf('label={c.security}') > options);
  assert.ok(form.indexOf('label={t.customSplit.eyebrow}') > options);
  assert.ok(form.indexOf('previewAmount > 0 && previewDeadline > 0') > options);
  assert.doesNotMatch(form, /lg:sticky|grid-drift/);
  assert.doesNotMatch(source, /\[:\{label\}:\]/);
  assert.ok(form.indexOf('<summary data-guide="buyer-tolerance"') < form.indexOf('label={c.tolerance}'));
});

test('prefilled optional settings stay visible and retain the original request payload', () => {
  assert.match(source, /useState\(initialTrustedMatch \|\| Boolean\(parsedInitialSplit\?\.pcts\) \|\| initialTolerance != null\)/);
  assert.match(source, /negotiationMaxIncreasePct: typeof tolerance === 'number' \? tolerance : undefined/);
  assert.match(source, /milestonePcts: customSplit \? parseMilestoneSplit\(splitText\)\.pcts \?\? undefined : undefined/);
  assert.match(source, /trustedMatch,/);
});
