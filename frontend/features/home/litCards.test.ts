import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('the assistant card on Home opens Help with the words sent, never assistant mode (owner, 6 Nov 2026)', () => {
  const ask = source('./components/AskCard.tsx');
  assert.match(ask, /openHelp\(clean, \{ send: true \}\)/);
  assert.doesNotMatch(ask, /router\.push|'\/assistant'|carryAsk/);
});

test('the assistant card and the next step card share the lit card: the light, the mark beside the title, neutral pills', () => {
  for (const file of ['./components/AskCard.tsx', './components/HomeBlock.tsx']) {
    const card = source(file);
    assert.match(card, /<LitCard icon=/, file);
    assert.match(card, /CARD_PILL/, file);
  }
  const lit = source('./components/LitCard.tsx');
  assert.match(lit, /linear-gradient\(180deg,color-mix\(in_srgb,var\(--lp-accent\)_9%,var\(--lp-card\)\)/);
});

test('three suggestions on the assistant card in every language', async () => {
  const { startFlowCopy } = await import('../../shared/i18n/messages/startFlow');
  for (const [locale, copy] of Object.entries(startFlowCopy as Record<string, { home: { ask: { chips: string[] } } }>)) {
    assert.equal(copy.home.ask.chips.length, 3, locale);
  }
});

test('your first trade is lit too: a progress ring in the badge, the next step one tap away, then See all steps (owner, 6 Nov 2026: version B)', () => {
  const card = source('./components/FirstTrade.tsx');
  assert.match(card, /<LitCard badge=\{ring\}/);
  assert.match(card, /role="img" aria-label=\{doneText\}/);
  assert.match(card, /strokeDasharray=\{`\$\{view\.done\} \$\{total\}`\}/);
  assert.match(card, /case 'money'[\s\S]*href: '\/add'/);
  assert.match(card, /name="list"[\s\S]*\{card\.see\}/);
});
