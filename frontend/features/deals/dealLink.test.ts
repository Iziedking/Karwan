import assert from 'node:assert/strict';
import test from 'node:test';
import { sellerDealLink } from './dealLink';

///   npx tsx --test features/deals/dealLink.test.ts

test('the link opens the deal form with the seller filled in, as the assistant gives it', () => {
  assert.equal(sellerDealLink('https://testnet.karwan.site', 'ada'), 'https://testnet.karwan.site/buyer?mode=direct&seller=%40ada');
  assert.equal(sellerDealLink('https://testnet.karwan.site/', 'ada'), 'https://testnet.karwan.site/buyer?mode=direct&seller=%40ada');
});
