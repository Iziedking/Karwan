import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shortlistCopy } from '../../shared/i18n/messages/shortlist';
import { agentQuestionsCopy } from '../../shared/i18n/messages/agentQuestions';

/// The request page as drawn in Figma (owner, 7 Nov 2026, page "Request page · 7 Nov").

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('the page leads with the offer count large, three counts, and the photo beside the title', () => {
  const page = source('../search/components/RequestPage.tsx');
  assert.match(page, /copy\.headline\.split\('\{count\}'\)/);
  assert.match(page, /text-\[44px\][^"]*sm:text-\[56px\]/);
  assert.match(page, /from=\{firstPhoto \? 1 : 0\}/);
  const reach = source('./components/RequestReachLine.tsx');
  assert.match(reach, /\[reach\.fit, t\.statFit\], \[reach\.offered, t\.statOffered\], \[reach\.asked, t\.statAsked\]/);
  assert.match(reach, /className="sr-only">\{line\}/);
});

test('the shortlist shows the best three, Show all opens the rest, notes sit behind an (i)', () => {
  const list = source('./components/Shortlist.tsx');
  assert.match(list, /const PREVIEW = 3;/);
  assert.match(list, /fill\(copy\.showAll, \{ n: ranked\.length \}\)/);
  assert.match(list, /<Hint align="end">\{copy\.noneVerifiedTip\}<\/Hint>/);
  assert.match(list, /<Hint>\{copy\.checkedTip\}<\/Hint>/);
  for (const [locale, copy] of Object.entries(shortlistCopy)) {
    assert.match(copy.showAll, /\{n\}/, locale);
    assert.doesNotMatch(copy.noneVerifiedTip + copy.checkedTip, /—/, locale);
  }
  for (const [locale, copy] of Object.entries(agentQuestionsCopy)) {
    assert.ok(copy.statFit && copy.statOffered && copy.statAsked, locale);
  }
});

test('Edit and Cancel are rows in one card, their notes in tooltips, Cancel asked in a sheet', () => {
  const brief = source('./components/BriefSections.tsx');
  assert.equal(brief.match(/<ManageRow /g)?.length, 2);
  assert.match(brief, /<Hint>\{note\}<\/Hint>/);
  assert.match(brief, /<ConfirmSheet\s+open=\{confirm\}/);
  const rows = brief.slice(0, brief.indexOf('function EditBriefModal')) + brief.slice(brief.indexOf('export function CancelBriefSection'));
  assert.doesNotMatch(rows, /PageCard|SectionTag|#b03d3a|\bmono\b/);
  const page = source('../search/components/RequestPage.tsx');
  assert.match(page, /not-has-\[\[data-manage-row\]\]:hidden/);
});

test('every note opens in the soft green bubble, and its (i) turns green (owner, 7 Nov 2026)', () => {
  const hint = source('../../shared/components/Hint.tsx');
  assert.match(hint, /data-hint-tip/);
  assert.match(hint, /rounded-\[16px\] border border-\[var\(--soft-green-edge\)\] bg-\[var\(--soft-green\)\]/);
  assert.match(hint, /bg-\[var\(--soft-green-chip\)\] text-\[var\(--soft-green-ink\)\]/);
  assert.doesNotMatch(hint, /--color-ink|--color-bg|bg-\[var\(--raised\)\]/);
  const tokens = source('../../app/design-tokens.css');
  for (const name of ['--soft-green:', '--soft-green-edge:', '--soft-green-chip:', '--soft-green-ink:']) {
    assert.equal(tokens.split(name).length - 1, 2, `${name} has a light and a dark value`);
  }
});

test('confirm popups carry the green badge and an optional soft green note', () => {
  const sheet = source('../deals/workspace/ConfirmSheet.tsx');
  assert.match(sheet, /data-confirm-badge/);
  assert.match(sheet, /data-confirm-note/);
  assert.match(sheet, /bg-\[var\(--soft-green\)\]/);
});

test('main actions are Karwan green, never ink-filled (owner, 7 Nov 2026)', () => {
  for (const file of [
    '../assistant/PickUpLine.tsx',
    '../profile/components/RegisterBusinessBand.tsx',
    '../profile/components/SmeCompanyBand.tsx',
    '../../shared/components/AssistantWidget.tsx',
    '../../shared/components/NextMoveNudge.tsx',
  ]) {
    assert.match(source(file), /bg-\[var\(--action\)\][^"]*text-\[var\(--on-action\)\]/, file);
  }
  assert.match(source('../../shared/components/Button.tsx'), /primary: 'bg-\[var\(--action\)\] text-\[var\(--on-action\)\]/);
});
