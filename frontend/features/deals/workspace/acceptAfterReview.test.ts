import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dealPageCopy } from '../../../shared/i18n/messages/dealPage';

/// The work check found a gap between a delivery and the request: the buyer
/// may release after their own review, and a person at Karwan may clear it
/// (view 21, testnet 0x9de5…, 7 Nov 2026).
///
///   npx tsx --test features/deals/workspace/acceptAfterReview.test.ts

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('the buyer sees I checked it, release beside Ask for changes, and it opens the release sheet with the acceptance', () => {
  const hero = read('./DealHero.tsx');
  assert.match(hero, /askForChanges \? \([\s\S]{0,700}data-accept-after-review onClick=\{onAcceptRelease\}/);
  const actions = read('./useWorkspaceActions.ts');
  assert.match(actions, /acceptedAfterReview: true \}\);/);
  assert.match(actions, /api\.releaseDirectDeal\(deal\.jobId, address, sheet\.acceptedAfterReview \? \{ acceptedAfterReview: true \} : undefined\)/);
  assert.match(read('./DealWorkspace.tsx'), /onAcceptRelease=\{actions\.openAcceptRelease\}/);
});

test('the release carries the acceptance from the page and from the assistant card', () => {
  assert.match(read('../../../core/api.ts'), /JSON\.stringify\(\{ caller, \.\.\.\(opts\?\.acceptedAfterReview \? \{ acceptedAfterReview: true \} : \{\}\) \}\)/);
  assert.match(read('../../../shared/assistant/AssistantThread.tsx'), /p\.acceptedAfterReview \? \{ acceptedAfterReview: true \} : undefined/);
});

test('a person at Karwan clears a work mismatch from the review panel with a reason', () => {
  const panel = read('../../admin/DeliveryReviewPanel.tsx');
  assert.match(panel, /api\.adminClearWorkMismatch\(jobId, workReason\)/);
  assert.match(panel, /data-work-clear disabled=\{busy \|\| workReason\.trim\(\)\.length < 10\}/);
  assert.match(read('../../../app/admin/support/page.tsx'), /Work does not match the request/);
});

test('the words exist in every language', () => {
  for (const [locale, copy] of Object.entries(dealPageCopy)) {
    assert.ok(copy.acceptAfterReview.length > 3, locale);
    assert.ok(copy.acceptTitle.length > 3, locale);
    assert.ok(copy.acceptBody.length > 20, locale);
  }
});
