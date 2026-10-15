import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('staking money asks first, in the confirm sheet, never a browser popup or an in-card banner', () => {
  const card = read('./StakeCard.tsx');
  assert.doesNotMatch(card, /window\.confirm/);
  assert.match(card, /<ConfirmSheetShell[^>]*open=\{depositSheet\}/);
  assert.match(card, /<ConfirmSheetShell[^>]*open=\{pendingWithdraw !== null\}/);
  const claim = read('./YieldClaimPanel.tsx');
  assert.match(claim, /<ConfirmSheetShell[^>]*open=\{sheetOpen\}/);
});

test('the stake card says each fact once, at 14px or more, without arrows or browser tooltips', () => {
  const card = read('./StakeCard.tsx');
  assert.doesNotMatch(card, /text-\[13px\]/);
  assert.doesNotMatch(card, /↘|↗/);
  assert.doesNotMatch(card, / title=\{/);
  // The tier and score already lead the page; the card does not repeat them.
  assert.doesNotMatch(card, /\{rep\.score\}\/1000/);
  assert.match(card, /<Hint[^>]*>\{sc\.summary\.freeHint\}<\/Hint>/);
});

test('yield is translated, shows the claimable amount once, and keeps contract internals off the page', () => {
  const claim = read('./YieldClaimPanel.tsx');
  assert.match(claim, /useTranslations\(\)\.yieldClaim/);
  assert.doesNotMatch(claim, /Distributed to you|contract ↗|arcscan|linear-gradient|text-\[13px\]/);
  assert.equal(claim.match(/t\.claimTemplate/g)?.length, 1);
});

test('tiers read in sentence case on the stake page', () => {
  const page = read('../../../app/stake/page.tsx');
  assert.match(page, /TIER_LABEL\[tier\]/);
  assert.match(page, /TIER_LABEL\[name\]/);
  assert.doesNotMatch(page, /\{tier\}\s*\{capped/);
  assert.match(page, /toNextTemplate\.replace\('\{tier\}', TIER_LABEL\[nextTier\]\)/);
});
