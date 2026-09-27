import assert from 'node:assert/strict';
import test from 'node:test';
import { MESSAGES } from './messages';
import { TERMS_DISPLAY_VERSION } from '../components/TermsContent';

test('the terms describe mainnet with real USDC and passkey recovery, not a testnet-only product', () => {
  const en = JSON.stringify(MESSAGES.en.termsPage);
  assert.match(en, /recovery password/);
  assert.match(en, /48-hour wait/);
  assert.match(en, /have not had an external audit/);
  assert.doesNotMatch(en, /Karwan is on testnet right now/);
  assert.doesNotMatch(en, /testnet quality/);
  assert.doesNotMatch(en, /email or a passkey/, 'passkey accounts are not operated by Karwan');
});

test('every language carries the passkey and mainnet access entries, with no em dash', () => {
  for (const [locale, messages] of Object.entries(MESSAGES)) {
    const t = messages.termsPage;
    assert.ok(t.s2.passkey.label && t.s2.passkey.body, locale);
    assert.ok(t.s6.bullets.mainnetAccess.label && t.s6.bullets.mainnetAccess.body, locale);
    for (const part of [t.s2.passkey.body, t.s2.operated.body, t.s6.bullets.testnet.body, t.s6.bullets.contract.body, t.s6.bullets.outage.body]) {
      assert.doesNotMatch(part, /—/, locale);
    }
  }
});

test('the displayed terms version moved with this change', () => {
  assert.equal(TERMS_DISPLAY_VERSION, '2.2.0');
});
