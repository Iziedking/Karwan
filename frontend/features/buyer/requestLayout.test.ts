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
  const builder = form.indexOf('<TermsBuilder');
  assert.ok(builder > form.indexOf('label={t.sectionTerms.deadlineLabel}') && builder < options);
  assert.ok(!form.includes('label={t.customSplit.eyebrow}'));
  assert.ok(form.indexOf('previewAmount > 0 && previewDeadline > 0') > options);
  assert.doesNotMatch(form, /lg:sticky|grid-drift/);
  assert.doesNotMatch(source, /\[:\{label\}:\]/);
  assert.ok(form.indexOf('<summary data-guide="buyer-tolerance"') < form.indexOf('label={c.tolerance}'));
});

test('prefilled optional settings stay visible; the terms carry the split and the agreement', () => {
  assert.match(source, /useState\(initialTrustedMatch \|\| initialTolerance != null\)/);
  assert.match(source, /parsedInitialSplit\?\.pcts\s*\?\s*\{\s*\.\.\.DEFAULT_TERMS/);
  assert.match(source, /negotiationMaxIncreasePct: typeof tolerance === 'number' \? tolerance : undefined/);
  assert.match(source, /milestonePcts: terms\.parts\.map\(\(part\) => part\.pct\)/);
  assert.match(source, /terms: agreementText,/);
  assert.match(source, /reviewWindowDays: terms\.reviewWindowDays,/);
  assert.match(source, /trustedMatch,/);
});
