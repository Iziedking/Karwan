import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { stepOneBlocker } from './offerFlow';
import { offerFlowCopy } from '../../shared/i18n/messages/offerFlow';

const t = offerFlowCopy.en;

test('step one says what is missing before Continue works', () => {
  assert.equal(stepOneBlocker('', '', t), t.titleShort);
  assert.equal(stepOneBlocker('Lo', 'A full description', t), t.titleShort);
  assert.equal(stepOneBlocker('Logo design', 'Logo', t), t.descriptionShort);
  assert.equal(stepOneBlocker('  Logo design ', '  Two concepts  ', t), null);
  assert.match(t.titleShort, /3/);
  assert.match(t.descriptionShort, /5/);
});

test('publishing ends in a clear result, and a match is offered, not jumped to', () => {
  const form = readFileSync(new URL('./components/PostListingForm.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(form, /router\.push\(`\/jobs\//, 'a match never moves the page on its own');
  assert.match(form, /offer\.liveTitle/);
  assert.match(form, /href=\{`\/listings\/\$\{published\.id\}`\}/);
  assert.match(form, /offer\.postAnother/);
  assert.match(form, /offer\.openDeal/);
  assert.doesNotMatch(form, /\(err as Error\)\.message/, 'no raw error text');
  assert.doesNotMatch(form, /pl\.watchingScanning/);
  assert.match(form, /stepOneBlocker\(/);
});

test('the seller deposit option speaks plainly in every language', () => {
  const jargon = /\bstake|slash|unilateral|↳|mise\b|miser|स्टेक|रहن|رهن|unilatérale/i;
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw']) {
    const src = readFileSync(new URL(`../../shared/i18n/messages/${locale}.ts`, import.meta.url), 'utf8');
    // Only the words people read: the values, not the key names.
    const start = src.search(/trustedMatch: \{\s*eyebrow: ['"]/);
    const block = src.slice(start, src.indexOf('\n    },', start)).replace(/\b\w+:\s/g, '');
    const security = (src.match(/"security(Help)?": "[^"]*"/g) ?? []).join(' ').replace(/"security(Help)?": /g, '');
    // The direct deal's deadline hint is the last one before its trustedMatch block.
    const deadline = (src.slice(0, start).match(/deadlineHint: ['"][^\n]*/g) ?? []).at(-1)?.replace('deadlineHint: ', '') ?? '';
    for (const text of [block, security, deadline]) assert.doesNotMatch(text, jargon, `${locale}: ${text.slice(0, 80)}`);
  }
  const direct = readFileSync(new URL('../deals/components/DirectDealForm.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(direct, /<Hint>\{dd\.trustedMatch\.body\}<\/Hint>/, 'the explanation is on the page');
  const option = direct.slice(direct.indexOf('checked={requireStake}'), direct.indexOf('</label>', direct.indexOf('checked={requireStake}')));
  assert.doesNotMatch(option, /\bmono\b|uppercase|text-\[13px\]/, 'the deposit option reads like the rest of the form');
});

test('ways to charge that do not work yet stay hidden until business accounts open', () => {
  const form = readFileSync(new URL('./components/PostListingForm.tsx', import.meta.url), 'utf8');
  assert.match(form, /\{BUSINESS_ACCOUNTS_OPEN \? \(\s*<div role="group" aria-label=\{f\.charge\}>/);
});
