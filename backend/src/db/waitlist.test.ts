import assert from 'node:assert/strict';
import test from 'node:test';
import { mainnetAccessEmail, MAINNET_SIGNUP_URL } from '../emails/mainnetAccess.js';
import { joinWaitlist, listWaitlist, parseUseCases, setWaitlistUseCases, waitlistPosition } from './waitlist.js';
import { waitlistJoinedEmail } from '../emails/waitlistJoined.js';

test('place in line counts everyone who joined first, and joining again keeps the place', async () => {
  const first = await joinWaitlist('first@example.com', 'en');
  await new Promise((r) => setTimeout(r, 5));
  await joinWaitlist('Second@Example.com', 'fr');
  const again = await joinWaitlist('first@example.com', 'en');
  assert.equal(first.created, true);
  assert.equal(again.created, false);
  assert.equal(again.entry.joinedAt, first.entry.joinedAt);
  assert.equal(await waitlistPosition('first@example.com'), 1);
  assert.equal(await waitlistPosition('second@example.com'), 2);
  assert.equal(await waitlistPosition('nobody@example.com'), null);
});

test('the access email links straight to sign-up and carries no em dash', () => {
  const { subject, html, text } = mainnetAccessEmail();
  assert.match(html, new RegExp(MAINNET_SIGNUP_URL.replace(/[?.]/g, '\\$&')));
  assert.match(text, /start\?mode=signup/);
  for (const part of [subject, html, text]) assert.doesNotMatch(part, /—/);
});

test('several use cases are stored with the entry in a fixed order, and a later answer replaces the first', async () => {
  await joinWaitlist('usecase@example.com', 'en');
  assert.equal(await setWaitlistUseCases('UseCase@example.com', ['buy_goods', 'sell_services']), true);
  assert.equal(await setWaitlistUseCases('nobody-here@example.com', ['sell_services']), false);
  const first = (await listWaitlist()).find((w) => w.email === 'usecase@example.com');
  assert.deepEqual(first?.useCases, ['sell_services', 'buy_goods']);
  await setWaitlistUseCases('usecase@example.com', ['business_trade']);
  const second = (await listWaitlist()).find((w) => w.email === 'usecase@example.com');
  assert.deepEqual(second?.useCases, ['business_trade']);
});

test('stored answers parse back to known use cases only', () => {
  assert.deepEqual(parseUseCases('sell_goods,unknown,buy_services'), ['buy_services', 'sell_goods']);
  assert.deepEqual(parseUseCases('sell_services'), ['sell_services']);
  assert.deepEqual(parseUseCases(null), []);
});

test('the joined email names the place in line, links to testnet and carries no em dash', () => {
  const { subject, html, text } = waitlistJoinedEmail(42);
  assert.match(text, /number 42/);
  assert.match(html, /https:\/\/testnet\.karwan\.site\/start\?mode=signup/);
  for (const part of [subject, html, text]) assert.doesNotMatch(part, /—/);
});
