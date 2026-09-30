import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandedEmailHtml, emailAmount, emailButton, emailFacts, emailHeading, emailQuote, emailText, emailThread } from './brand.js';
import { otpEmailHtml, verifyEmailHtml } from './codeEmails.js';
import { dealInviteHtml } from './dealInvite.js';
import { dealUpdateHtml } from './dealUpdate.js';
import { dealCancelledHtml } from './dealCancelled.js';
import { dealEventHtml, dealEventInnerHtml, formatEmailUsdc } from './dealEventEmail.js';
import { amountFor } from './dealNotifier.js';
import { waitlistJoinedEmail } from './waitlistJoined.js';
import { mainnetAccessEmail } from './mainnetAccess.js';
import { recoveryEmail } from './recovery.js';

const invite = {
  to: 'ada@example.com',
  claimUrl: 'https://karwan.site/invite/abc',
  dealAmountUsdc: '1200',
  inviterMasked: '0xb19f…e97a',
  expiresLabel: 'Expires in 7 days',
  acceptanceLabel: '24 hours',
  deliveryLabel: '14 days',
};

test('every block is a table row, so nothing escapes the card', () => {
  const blocks = [
    emailHeading({ kicker: 'Escrow funded', title: 'Escrow is funded' }),
    emailAmount('1,200.00'),
    emailText('One.', 'Two.'),
    emailFacts([['Deal', 'Logo']]),
    emailButton('Open the deal', 'https://karwan.site/deals/1'),
    emailQuote('a\nb'),
    emailThread([{ who: 'User', when: 'now', text: 'hi' }]),
  ];
  for (const block of blocks) assert.match(block.trim(), /^<tr>[\s\S]*<\/tr>$/);
});

test('text a person wrote is escaped everywhere it lands', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html = emailText(evil) + emailQuote(evil) + emailFacts([[evil, evil]]) + emailHeading({ title: evil });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('a deal event shows its amount as the largest line, only when it has one', () => {
  const withAmount = dealEventInnerHtml({ kicker: 'Escrow funded', subject: 's', heading: 'Escrow is funded', body: 'b', amount: '1200.5' });
  assert.match(withAmount, /1,200\.50/);
  const without = dealEventInnerHtml({ kicker: 'Dispute', subject: 's', heading: 'Deal moved to dispute', body: 'b' });
  assert.doesNotMatch(without, /USDC/);
});

test('the amount comes from the event payload and never from a guess', () => {
  const event = (type: string, payload: Record<string, unknown>) => ({ type, payload }) as unknown as Parameters<typeof amountFor>[0];
  assert.equal(amountFor(event('deal.accepted', { dealAmountUsdc: '600' })), '600');
  assert.equal(amountFor(event('deal.matched', { agreedPriceUsdc: '80.5' })), '80.5');
  assert.equal(amountFor(event('deal.disputed', { dealAmountUsdc: '600' })), undefined);
  assert.equal(amountFor(event('deal.accepted', { dealAmountUsdc: 'lots' })), undefined);
  assert.equal(amountFor(event('deal.accepted', {})), undefined);
});

test('USDC amounts read with two decimals and grouping', () => {
  assert.equal(formatEmailUsdc('1200'), '1,200.00');
  assert.equal(formatEmailUsdc('0.5'), '0.50');
});

test('rendered emails have no shouting labels, no em dashes and one lime action at most', () => {
  const emails = [
    otpEmailHtml('447301'),
    verifyEmailHtml('582914'),
    dealInviteHtml(invite),
    dealInviteHtml({ ...invite, signInWallet: '0x7a21…90cc', signInVia: 'wallet' }),
    dealUpdateHtml({ ...invite, changedLabels: ['Amount'] }),
    dealCancelledHtml({ to: 'a@b.c', dealAmountUsdc: '5', inviterMasked: '0x1…2', reason: 'Changed plans' }),
    dealEventHtml({ kicker: 'Escrow funded', subject: 's', heading: 'Escrow is funded', body: 'b', amount: '5', ctaLabel: 'Open the deal', ctaUrl: 'https://k/d' }),
    waitlistJoinedEmail(3).html,
    mainnetAccessEmail().html,
    recoveryEmail('started', { releasableAt: 0, cancelUrl: 'https://k/c' }).html,
  ];
  for (const html of emails) {
    assert.doesNotMatch(html, /—/);
    assert.doesNotMatch(html, /text-transform:uppercase/);
    assert.doesNotMatch(html, />KARWAN</);
    const actions = html.match(/background:#afc95b;color/g) ?? [];
    assert.ok(actions.length <= 1, 'one primary action per email');
  }
});

test('the invite for an existing account names the wallet and has no claim wording', () => {
  const html = dealInviteHtml({ ...invite, signInWallet: '0x7a21…90cc', signInVia: 'login' });
  assert.match(html, /0x7a21…90cc/);
  assert.match(html, /Open the deal/);
  assert.doesNotMatch(html, /Invite link/);
});

test('the shell supports a dark theme and carries a hidden preview line', () => {
  const html = brandedEmailHtml({ title: 't', inner: '', preheader: 'Preview text' });
  assert.match(html, /name="color-scheme" content="light dark"/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /Preview text/);
});
