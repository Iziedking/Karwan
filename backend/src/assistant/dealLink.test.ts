import assert from 'node:assert/strict';
import test from 'node:test';
import { sellerDealLink, shareMyDealLink } from './dealLink.js';

///   npx tsx --test src/assistant/dealLink.test.ts

test('the link opens the deal form with the seller filled in', () => {
  assert.equal(sellerDealLink('https://testnet.karwan.site', 'ada'), 'https://testnet.karwan.site/buyer?mode=direct&seller=%40ada');
  assert.equal(sellerDealLink('https://testnet.karwan.site/', 'ada'), 'https://testnet.karwan.site/buyer?mode=direct&seller=%40ada');
});

test('a person with a tag gets their link and the line to send with it', async () => {
  const out = await shareMyDealLink('0xada', { base: 'https://karwan.site', profile: async () => ({ handle: 'ada' }) });
  assert.deepEqual(out, {
    link: 'https://karwan.site/buyer?mode=direct&seller=%40ada',
    note: 'They open it, add the amount and terms you agreed, and pay into the deal. You accept before anything is final.',
  });
});

test('no tag, no link', async () => {
  const out = await shareMyDealLink('0xada', { base: 'https://karwan.site', profile: async () => ({}) });
  assert.ok('error' in out);
});
