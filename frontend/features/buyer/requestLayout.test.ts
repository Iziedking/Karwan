import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./components/PostJobForm.tsx', import.meta.url), 'utf8');

test('request starts with its brief; optional controls follow budget and deadline', () => {
  const form = source.slice(source.indexOf('<form ref='));
  const options = form.indexOf('<details open={optionsOpen}');
  assert.ok(options > form.indexOf('label={rf.neededByLabel}'));
  assert.ok(form.indexOf('label={c.tolerance}') > options);
  assert.ok(form.indexOf('label={c.security}') > options);
  const builder = form.indexOf('<TermsBuilder');
  assert.ok(builder > form.indexOf('label={rf.neededByLabel}') && builder < options);
  assert.ok(!form.includes('label={t.customSplit.eyebrow}'));
  // One screen (view 48): no steps, and the parts sit folded behind Pay in parts.
  assert.doesNotMatch(source, /setStep|stepOf|rs\.continue/);
  assert.ok(form.indexOf('data-pay-in-parts') < builder);
  assert.match(form, /\{inParts \? \(/);
  assert.doesNotMatch(form, /lg:sticky|grid-drift/);
  assert.doesNotMatch(source, /\[:\{label\}:\]/);
  assert.ok(form.indexOf('<summary data-guide="buyer-tolerance"') < form.indexOf('label={c.tolerance}'));
});

test('prefilled optional settings stay visible; the terms carry the split and the agreement', () => {
  assert.match(source, /useState\(initialTrustedMatch \|\| initialTolerance != null\)/);
  assert.match(source, /parsedInitialSplit\?\.pcts\s*\?\s*\{\s*\.\.\.DEFAULT_TERMS/);
  assert.match(source, /negotiationMaxIncreasePct: typeof tolerance === 'number' \? tolerance : undefined/);
  assert.match(source, /milestonePcts: dealTerms\.parts\.map\(\(part\) => part\.pct\)/);
  // Paid at once, the one part is the request itself.
  assert.match(source, /inParts \? terms : \{ \.\.\.terms, parts: \[\{ pct: 100, what: brief\.trim\(\)/);
  assert.match(source, /terms: agreementText,/);
  assert.match(source, /reviewWindowDays: dealTerms\.reviewWindowDays,/);
  assert.match(source, /trustedMatch,/);
});
