import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccountResale } from './accountResale.js';

test('account, login and credential resale is caught', () => {
  for (const text of [
    'help me find who sells outlier account',
    'I want to buy an Outlier.ai account',
    'Verified Upwork account for sale',
    'Selling aged Facebook accounts in bulk',
    'buy 10 verified binance accounts',
    'rent my netflix login for a month',
    'KYC verified Payoneer account, instant delivery',
    'Instagram handles for sale',
    'Reselling premium ChatGPT accounts',
  ]) {
    assert.equal(isAccountResale(text), true, text);
  }
});

test('ordinary work that mentions accounts is not caught', () => {
  for (const text of [
    'Accounting software setup for clients',
    'Monthly bookkeeping and account reconciliation',
    'Set up your Shopify store account and payment settings',
    'Social media account manager for a bakery',
    'Recover my hacked Instagram account',
    'Logo design, 3 revisions',
    'Build a landing page with login and signup',
    'Translate my LinkedIn profile into French',
    'Grow your TikTok account with content planning',
    'Sell my old iPhone 14',
  ]) {
    assert.equal(isAccountResale(text), false, text);
  }
});
