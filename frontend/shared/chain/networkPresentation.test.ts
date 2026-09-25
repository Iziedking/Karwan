import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { settlementChain } from '../../core/arcNetwork';
import { networkPresentation } from './networkPresentation';
import { networkCopy } from '../i18n/messages/network';
import { en } from '../i18n/messages/en';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('current environment is truthfully derived from the wallet chain, not a brand or display flag', () => {
  const view = networkPresentation(settlementChain);
  assert.equal(view.environment, 'testnet');
  assert.equal(view.chainId, settlementChain.id);
  assert.equal(view.explorerUrl, settlementChain.blockExplorers?.default.url);
  assert.equal(view.noticeKey, 'testnetNotice');
  assert.equal(view.faucetUrl, 'https://faucet.circle.com');
  // wagmi takes its chain from the single network switch, never its own definition.
  assert.match(source('../../core/wagmi.ts'), /import \{[^}]*settlementChain as arcChain[^}]*\} from '.\/arcNetwork'/);
});

test('explicit mainnet metadata selects the real-funds notice and never offers a test faucet', () => {
  // Synthetic metadata exercises presentation only; this is not an Arc deployment.
  const view = networkPresentation({ id: 1, testnet: false, blockExplorers: { default: { url: 'https://explorer.example' } } });
  assert.equal(view.environment, 'mainnet');
  assert.equal(view.noticeKey, 'mainnetNotice');
  assert.equal(view.faucetUrl, undefined);
  assert.equal(view.explorerUrl, 'https://explorer.example');
});

test('absent metadata cannot silently label a network mainnet or provide invented links', () => {
  const view = networkPresentation({ id: 1 });
  assert.equal(view.environment, 'unknown');
  assert.equal(view.noticeKey, 'unknownNotice');
  assert.equal(view.explorerUrl, undefined);
  assert.equal(view.faucetUrl, undefined);
});

test('all locales distinguish brand, environment, and fund value', () => {
  const keys = Object.keys(networkCopy.en).sort();
  for (const copy of Object.values(networkCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), keys);
    for (const value of Object.values(copy)) assert.ok(value.trim());
    assert.notEqual(copy.testnet, copy.mainnet);
    assert.notEqual(copy.testnetNotice, copy.mainnetNotice);
  }
  assert.doesNotMatch([en.howItWorksPage.cta.title, en.howItWorksPage.cta.body, en.howItWorksPage.faq.q8.a, en.feedback.hero.body, en.docsRoadmapPage.intro].join(' '), /testnet/i);
});

test('network details are optional in public chrome and always visible beside balances and transfers', () => {
  const footer = source('../components/SiteFooter.tsx');
  assert.match(footer, /networkUi.poweredByArc/);
  assert.match(footer, /<NetworkContext disclosure \/>/);
  assert.doesNotMatch(footer, /https:\/\/testnet.arcscan.app|landingEditorial.testnet/);
  assert.match(source('../../app/page.tsx'), /networkUi.builtOnArc/);
  for (const file of [
    '../../features/account/AccountPageV1.tsx',
    '../../app/bridge/page.tsx',
    '../../features/money/components/MoneyHome.tsx',
    '../../features/bridge/components/CrossChainFlow.tsx',
  ]) assert.match(source(file), /<NetworkContext \/>/, file);
  const component = source('../components/NetworkContext.tsx');
  assert.match(component, /networkPresentation\(settlementChain\)/);
  assert.match(component, /t\[network.noticeKey\]/);
  assert.doesNotMatch(component, /localStorage|switchChain|process.env/);
});
