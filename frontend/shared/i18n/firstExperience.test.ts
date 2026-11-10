import assert from 'node:assert/strict';
import test from 'node:test';
import { MESSAGES } from './messages/all';
import { landingCopy } from './messages/landing';

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
    };
    const found = Object.entries(first).filter(([, text]) => CHAIN_WORDS.test(text)).map(([key, text]) => `${key}: ${text}`);
    assert.deepEqual(found, []);
  });
}
