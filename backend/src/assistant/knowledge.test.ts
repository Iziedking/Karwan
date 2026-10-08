import assert from 'node:assert/strict';
import test from 'node:test';
import { KARWAN_ASSISTANT_SYSTEM, KARWAN_PRODUCT_IDENTITY } from './knowledge.js';

test('assistant leads with unified reputation and its open market for local and cross-border trade', () => {
  assert.equal(
    KARWAN_PRODUCT_IDENTITY,
    'Karwan unifies online reputation, starting with an open market for secure local and cross-border trade.',
  );
  assert.match(KARWAN_ASSISTANT_SYSTEM, /buy or sell services and digital work today, local or cross-border/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /physical goods and business trade are coming soon/);
});

test('assistant keeps current and planned market capabilities separate', () => {
  assert.match(KARWAN_ASSISTANT_SYSTEM, /browser companion, mainnet settlement, and local bank payout corridors are planned and are not live today/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /A local trade can still be created today, but its current settlement is test USDC/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /limited to eligible Karwan-originated accepted invoices or purchase orders/);
});

test('assistant keeps all three wallet roles distinct', () => {
  assert.match(KARWAN_ASSISTANT_SYSTEM, /SIGN-IN or identity wallet/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /BUYER AGENT wallet/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /SELLER AGENT wallet/);
  assert.doesNotMatch(KARWAN_ASSISTANT_SYSTEM, /AGENT wallets hold no funds of their own/);
});

test('assistant explains the unified identity and workspace model', () => {
  assert.match(KARWAN_ASSISTANT_SYSTEM, /one person identity and one login/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /personal workspace and can add an owner-only business workspace/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /one wallet and one USDC balance/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /Team permissions and multi-user business access are roadmap work/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /Sign-in method and workspace are different things/);
});

test('assistant states the reputation direction with confidence and never as live', () => {
  assert.match(KARWAN_ASSISTANT_SYSTEM, /Karwan lets your reputation travel with you, and lets your agent use that reputation to find, negotiate with, and transact with the right people/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /Humans make the decisions; agents do the legwork/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /The portable reputation and agent-to-agent network are being built and are not live/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /Today a person's Karwan reputation comes only from completed Karwan deals/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /Never claim to have read another platform, imported outside reputation or contacted a partner/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /only with their consent, and nothing is leaked/);
});

test('assistant prepares every step after posting, and never writes a dispute statement for them', () => {
  assert.match(KARWAN_ASSISTANT_SYSTEM, /show the offers on their request and choose one/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /ask for or answer a deadline extension/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /propose or answer cancelling a deal, give a dispute statement, send a dispute to review/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /never fill an answer in for them/);
});

test('replies read like chat, link every page and keep unified reputation as planned', () => {
  assert.match(KARWAN_ASSISTANT_SYSTEM, /No headings/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /Never use em dashes or en dashes/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /markdown link with a plain label/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /bringing in a person's record from other platforms, with their permission, is planned/);
});
