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

test('every note uses the one tooltip look: a raised card with a pointer', () => {
  const hint = source('../../shared/components/Hint.tsx');
  assert.match(hint, /data-hint-tip/);
  assert.match(hint, /border-\[var\(--line-strong\)\] bg-\[var\(--raised\)\]/);
  assert.doesNotMatch(hint, /--color-ink|--color-bg/);
});
