import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// Trade record and sharing in the new look (view 48, batch 9e, Figma page
/// "Batch 9 · Trade record and sharing").
///
///   npx tsx --test features/reputation/recordLook.test.ts

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const FILES = {
  passport: source('./components/CreditPassport.tsx'),
  share: source('./components/PassportSharePanel.tsx'),
  attested: source('./components/AttestedDeals.tsx'),
  badge: source('./components/ReputationBadge.tsx'),
  yield: source('./components/YieldClaimPanel.tsx'),
  reserves: source('./components/ReservesWidget.tsx'),
  peek: source('../jobs/components/ProfilePeekModal.tsx'),
};
const hub = source('../profile/components/ProfileAccountHub.tsx');

test('no old landing tokens, no green outside a main button, nothing bold, small or in mono capitals', () => {
  for (const [name, s] of Object.entries(FILES)) {
    assert.doesNotMatch(s, /--lp-|--color-accent|--accent\b|--accent-ink|#6a8a1e/i, name);
    assert.doesNotMatch(s, /font-(extra)?bold/, name);
    assert.doesNotMatch(s, /text-\[(9|1[0-3])(\.\d+)?px\]/, name);
    assert.doesNotMatch(s, /uppercase tracking-\[/, name);
  }
  // A tier reads in ink on the badge; the shared hue stays for other screens.
  assert.doesNotMatch(FILES.badge, /color: TIER_HUE\[t\]/);
});

test('Profile sums the record up in one row that opens its own page', () => {
  assert.doesNotMatch(hub, /RecordStats|data-record-stats/);
  assert.match(hub, /recordSummary\(/);
  assert.match(hub, /href=\{`\/credit-passport\/\$\{address\}`\}/);
  for (const moved of ['pp.publicView', 'legacyContracts', 'agentCopy.recordSources', 'pp.share']) {
    assert.ok(!hub.includes(moved), `${moved} lives on the record page now`);
  }
});

test('the record page holds every line: deals in one card, and More for the owner', () => {
  const { passport } = FILES;
  assert.match(passport, /pc\.deals/);
  assert.match(passport, /pc\.more/);
  for (const row of ['publicView', 'legacyContracts', 'recordSources']) assert.match(passport, new RegExp(row));
  assert.match(passport, /CARD_CLASS/);
});

test('sharing uses the shared buttons and segmented choices, not green chips', () => {
  const { share, attested, yield: claim } = FILES;
  assert.match(share, /buttonClasses\(\{ size: 'lg'/);
  assert.match(share, /aria-pressed/);
  assert.match(share, /bg-\[var\(--ash\)\]/, 'the choices sit on one ash track');
  assert.match(share, /t\.done/);
  assert.match(attested, /CARD_CLASS/);
  assert.match(attested, /variant: 'secondary'/);
  assert.match(claim, /buttonClasses\(/);
});
