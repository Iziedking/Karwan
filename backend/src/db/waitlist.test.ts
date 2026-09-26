import assert from 'node:assert/strict';
import test from 'node:test';
import { mainnetAccessEmail, MAINNET_SIGNUP_URL } from '../emails/mainnetAccess.js';
import { joinWaitlist, waitlistPosition } from './waitlist.js';

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
