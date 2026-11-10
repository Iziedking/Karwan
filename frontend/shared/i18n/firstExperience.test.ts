import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MESSAGES } from './messages/all';
import { landingCopy } from './messages/landing';
import { marketShopCopy } from './messages/marketShop';
import { GUIDE_COPY } from '../guide/routeGuidance';

/// The first words a new person reads say what Karwan does and name no chain,
/// token or wallet (view 74).
///
///   npx tsx --test shared/i18n/firstExperience.test.ts

const CHAIN_WORDS = /testnet|mainnet|usdc|\barc\b|wallet|portefeuille|محفظ|الشبكة|वॉलेट|टेस्टनेट|मेननेट|pochi|mkoba/i;

for (const locale of Object.keys(MESSAGES) as Array<keyof typeof MESSAGES>) {
  const hero = landingCopy[locale].hero;
  const signup = MESSAGES[locale].signup;

  test(`the hero says what Karwan does in ${locale}`, () => {
    assert.ok(hero.promise.length > 20);
    assert.match(hero.promise, /Karwan|كاروان|कारवान/);
  });

  test(`the first screens name no chain, token or wallet in ${locale}`, () => {
    const first: Record<string, string> = {
      'hero.kicker': hero.kicker,
      'hero.promise': hero.promise,
      'hero.seeDemo': hero.seeDemo,
      'welcome.tagline': signup.welcome.tagline,
      'welcome.demoTagline': signup.welcome.demoTagline,
      'welcome.demoNote': signup.welcome.demoNote,
      'waitlist.title': signup.waitlist.title,
      'waitlist.body': signup.waitlist.body,
      'waitlist.lookFirst': signup.waitlist.lookFirst,
      'waitlist.seeDemo': signup.waitlist.seeDemo,
      'waitlist.seeDemoNote': signup.waitlist.seeDemoNote,
      'market.promise': marketShopCopy[locale].promise,
      'market.promiseNote': marketShopCopy[locale].promiseNote,
      'home.faucetLabel': MESSAGES[locale].accountHome.faucetLabel,
      'home.faucetBody': MESSAGES[locale].accountHome.faucetBody,
    };
    for (const [i, step] of (GUIDE_COPY[locale].welcome ?? []).entries()) {
      first[`tour.${i + 1}.title`] = step.title;
      first[`tour.${i + 1}.body`] = step.body;
    }
    assert.ok(marketShopCopy[locale].promise.length > 15);
    assert.doesNotMatch(marketShopCopy[locale].promise + marketShopCopy[locale].promiseNote, /—/);
    const found = Object.entries(first).filter(([, text]) => CHAIN_WORDS.test(text)).map(([key, text]) => `${key}: ${text}`);
    assert.deepEqual(found, []);
  });

  test(`the welcome tour is three plain steps in ${locale}`, () => {
    const steps = GUIDE_COPY[locale].welcome;
    assert.equal(steps.length, 3);
    for (const step of steps) {
      assert.ok(step.title.length > 3 && step.body.length > 20);
      assert.doesNotMatch(step.title + step.body, /—/);
    }
    assert.match(steps[0].body, /Karwan|كاروان|कारवान/);
  });
}

test('the welcome tour reads its own words, not the docs or the balance guide', () => {
  const source = readFileSync('shared/guide/GuideWelcome.tsx', 'utf8');
  assert.match(source, /GUIDE_COPY\[locale\]\.welcome/);
  assert.doesNotMatch(source, /docsProduct|guides\.balance/);
});
