import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { MESSAGES } from './messages';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

test('English public guides distinguish the mainnet wallet from testnet trading', () => {
  assert.match(MESSAGES.en.docsIndexPage.intro, /Trading is available on testnet/);
  assert.match(MESSAGES.en.docsIndexPage.intro, /mainnet escrow is not yet available/);
  assert.match(MESSAGES.en.docsRoadmapPage.intro, /contract release comes next/);
  assert.doesNotMatch(MESSAGES.en.docsRoadmapPage.intro, /20\d\d/);
  assert.match(MESSAGES.en.x402Page.intro, /not live/);
  assert.match(MESSAGES.en.howItWorksPage.stack.gateway, /code only/);
});

test('final milestone copy does not imply that silence prevents a seller claim', () => {
  const t = MESSAGES.en;
  for (const text of [
    t.docsDealsPage.review.body,
    t.docsFaqPage.items.find(item => item.q === 'What if the buyer is slow to release?')!.a,
    t.docsDisputesPage.buyerSilent.s1.body,
    t.directDealDetail.actionPanel.awaitingFinalRelease.buyerNoAppealTemplate,
  ]) {
    assert.match(text, /claim/);
    assert.doesNotMatch(text, /never releases automatically|always.*buyer|requires.*explicit approval/i);
  }
});

test('all locales retain the payment and timing placeholders', () => {
  for (const [locale, t] of Object.entries(MESSAGES)) {
    assert.match(t.directDealDetail.actionPanel.awaitingFinalRelease.buyerNoAppealTemplate, /\{rest\}/, locale);
    assert.match(t.docsDisputesPage.buyerSilent.s1.body, /\{reviewWindow\}/, locale);
    for (const text of [t.docsIndexPage.intro, t.docsRoadmapPage.intro, t.x402Page.intro]) {
      assert.ok(text.length > 50, locale);
    }
  }
});

test('public notices do not expose setup instructions or media source paths', () => {
  const telegram = read('features/telegram/components/TelegramConnectCard.tsx');
  const stake = read('features/reputation/components/StakeCard.tsx');
  const figures = read('features/docs/components/Prose.tsx');
  assert.doesNotMatch(telegram, /TELEGRAM_BOT_TOKEN|TELEGRAM_BOT_USERNAME/);
  assert.doesNotMatch(stake, /<code[^>]*>KARWAN_VAULT_ADDR|<code[^>]*>\.env/);
  assert.doesNotMatch(figures, /\{src\}\s*<\/span>/);
  assert.doesNotMatch(MESSAGES.en.telegramConnectCard.notConfiguredPrefix, /operator|server|set /i);
  assert.doesNotMatch(MESSAGES.en.docsDisputesPage.buyerSilent.s3.body, /we are still reviewing|send us feedback/i);
});

test('edited public documents link to files available in the checkout', () => {
  const repo = path.resolve(root, '..');
  for (const file of ['README.md', 'CIRCLE.md', 'docs/circle-integration.md', 'docs/architecture.md', 'docs/why-karwan.md', 'docs/reputation-model.md']) {
    const text = readFileSync(path.join(repo, file), 'utf8');
    for (const match of text.matchAll(/\]\((\.[^\s)#]+)(?:#[^)]*)?\)/g)) {
      assert.ok(existsSync(path.resolve(repo, path.dirname(file), match[1])), `${file}: ${match[1]}`);
    }
  }
});

test('reputation documentation describes model v2 without promising yield', () => {
  const text = read('../docs/reputation-model.md');
  assert.match(text, /Model version: 2/);
  assert.match(text, /ln\(2\)/);
  assert.doesNotMatch(text, /~5% APY|on mainnet, locked USDC earns|modelVersion=1/i);
  assert.match(text, /not currently a mainnet yield product/);
});
