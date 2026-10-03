import assert from 'node:assert/strict';
import test from 'node:test';
import { prohibitedBody, prohibitedReason } from './prohibited.js';

const caught: Array<[string, string]> = [
  ['who sells outlier account', 'account-resale'],
  ['Buy 5000 real Instagram followers', 'fake-engagement'],
  ['I need 50 5-star reviews for my shop', 'fake-engagement'],
  ['Fake bank statements and payslips for visa', 'forged-documents'],
  ['Scannable novelty ID cards', 'forged-documents'],
  ['Fresh CVV and fullz, bank logs available', 'payment-fraud'],
  ['Money flipping: send 100, get 500 back', 'payment-fraud'],
  ['Receive funds on my behalf and send them on', 'money-laundering'],
  ['Looking for money mules, easy pay', 'money-laundering'],
  ['Take my online proctored exam for me', 'exam-impersonation'],
  ['Hack into my ex\'s WhatsApp account', 'hacking'],
  ['Phishing page for a bank login', 'hacking'],
  ['Pistols for sale, fast delivery', 'weapons-drugs'],
  ['Plug for cocaine in Lagos', 'weapons-drugs'],
  ['Replica Rolex watches, 1:1 quality', 'counterfeit'],
  ['Join our pump and dump group', 'market-manipulation'],
  ['Need 200 wallets for airdrop farming', 'market-manipulation'],
  ['Sure odds and fixed matches every weekend', 'betting-fixing'],
  ['Daily betting tips, 100% win', 'betting-fixing'],
  ['Escort service available in Abuja', 'adult-services'],
  ['OnlyFans leaks for sale', 'adult-services'],
  ['Selling Xanax and Adderall, no prescription needed', 'prescription-drugs'],
  ['Plug for codeine syrup', 'weapons-drugs'],
  ['Instant loan approval, pay processing fee to receive funds', 'advance-fee'],
  ['Instant loans with no BVN check', 'advance-fee'],
  ['Write my thesis on supply chains', 'academic-fraud'],
  ['Ghostwriting dissertations for submission', 'academic-fraud'],
];

const honest = [
  'Code review for my React app',
  'Accounting software setup for clients',
  'Phone flipping: refurbish and resell used phones',
  'Exam prep tutoring for IELTS',
  'Write a test suite for my API',
  'Security audit and penetration test of my own website',
  'Design an invoice and receipt template',
  'Translate my degree certificate into French',
  'Grow my Instagram with a content plan',
  'Sell my old iPhone 14',
  'Product photos for my perfume brand',
  'Logo design, 3 revisions',
  'Sports analytics dashboard for a football club',
  'Proofread and edit my essay',
  'Help me plan my thesis outline',
  'Build a pharmacy delivery app with prescription upload',
  'Dating app UI design',
  'Explain how personal loans and interest rates work',
  'Event security staffing',
];

test('each fraud category is named with its own message', () => {
  for (const [text, category] of caught) {
    const match = prohibitedReason(text);
    assert.equal(match?.category, category, text);
    assert.match(match!.message, /^Karwan does not support/);
  }
});

test('honest work that shares the words is allowed', () => {
  for (const text of honest) assert.equal(prohibitedReason(text), null, text);
});

test('all fields are read together', () => {
  assert.equal(prohibitedReason('Social growth', 'Buy 1000 TikTok followers today')?.category, 'fake-engagement');
  assert.equal(prohibitedReason(undefined, '', null), null);
});

test('a write is refused from any text field, nested ones included', () => {
  const refused = prohibitedBody({ caller: '0xabc', amountUsdc: 50, terms: { items: [{ name: 'Buy 1000 TikTok followers' }] } });
  assert.equal(refused?.code, 'PROHIBITED_TRADE');
  assert.equal(refused?.category, 'fake-engagement');
  assert.equal(prohibitedBody({ title: 'Logo design', description: 'Three concepts', askingPriceUsdc: 150 }), null);
});
