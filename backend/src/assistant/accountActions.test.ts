import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAddResearchCreditConfirm,
  buildChangeSettingsConfirm,
  buildCreateBusinessConfirm,
  buildEditCompanyCardConfirm,
  buildEditProfileConfirm,
  buildJoinNewsletterConfirm,
  buildRemoveEmailConfirm,
  buildRemovePublishedDealsConfirm,
  buildRenameAgentsConfirm,
  buildRenameBusinessConfirm,
  buildSaveTradeLineConfirm,
  buildSendFeedbackConfirm,
  buildSetMemoryConfirm,
  buildSetOutsideReadsConfirm,
  buildSetUpAgentsConfirm,
  buildSetXHandleConfirm,
  buildUnlinkTelegramConfirm,
} from './accountActions.js';

const ME = `0x${'a'.repeat(40)}`;

function ok<T extends object>(card: T | { error: string }): T {
  assert.ok(!('error' in card), JSON.stringify(card));
  return card as T;
}
const err = (card: object) => (card as { error: string }).error;

test('settings change only what is named, and how we reach you needs the channel first', () => {
  const card = ok(buildChangeSettingsConfirm({ address: ME, settings: { locale: 'fr', notificationsMuted: true }, hasTelegram: false, hasEmail: true }));
  assert.deepEqual(card.payload, { address: ME, settings: { locale: 'fr', notificationsMuted: true } });
  assert.deepEqual(card.fields, [{ label: 'Language', value: 'French' }, { label: 'Alerts', value: 'Off' }]);
  assert.match(err(buildChangeSettingsConfirm({ address: ME, settings: {}, hasTelegram: true, hasEmail: true })), /which setting/);
  assert.match(err(buildChangeSettingsConfirm({ address: ME, settings: { notifyVia: 'telegram' }, hasTelegram: false, hasEmail: true })), /Telegram is not linked/);
  assert.match(err(buildChangeSettingsConfirm({ address: ME, settings: { notifyVia: 'email' }, hasTelegram: true, hasEmail: false })), /no verified email/);
});

test('a profile edit resends the whole profile with only the change applied', () => {
  const profile = {
    address: ME, role: 'both', displayName: 'Ada', accountKind: 'person' as const,
    seller: { skills: ['logos'], bio: 'Designer', minBudgetUsdc: 10, maxBudgetUsdc: 500, minDeadlineDays: 1, maxDeadlineDays: 30, keywords: ['logo'] },
    buyer: { maxBudgetUsdc: 100, minDeadlineDays: 1, maxDeadlineDays: 30, bidCollectionSeconds: 45, milestonePcts: [100] },
  };
  const card = ok(buildEditProfileConfirm({ profile, bio: 'Brand designer' }));
  assert.deepEqual(card.payload, {
    address: ME, role: 'both', displayName: 'Ada', accountKind: 'person',
    seller: { skills: ['logos'], bio: 'Brand designer', minBudgetUsdc: 10, maxBudgetUsdc: 500, minDeadlineDays: 1, maxDeadlineDays: 30 },
    buyer: profile.buyer,
  });
  assert.match(err(buildEditProfileConfirm({ profile })), /Say what to change/);
  assert.match(err(buildEditProfileConfirm({ profile, displayName: 'x'.repeat(41) })), /1 to 40/);
  assert.match(err(buildEditProfileConfirm({ profile: { address: ME, role: 'buyer', displayName: 'Ada' }, bio: 'Hi' })), /seller profile/);
});

test('links and email: a sign-in email stays, codes are never part of a card', () => {
  assert.deepEqual(ok(buildSetXHandleConfirm({ address: ME, handle: '@ada_x' })).payload, { address: ME, handle: 'ada_x' });
  assert.deepEqual(ok(buildSetXHandleConfirm({ address: ME, handle: null, current: 'ada_x' })).payload, { address: ME, handle: null });
  assert.ok('error' in buildSetXHandleConfirm({ address: ME, handle: 'has space' }));
  assert.match(err(buildRemoveEmailConfirm({ address: ME, email: 'a@b.co', loginEmail: true })), /how they sign in/);
  assert.deepEqual(ok(buildRemoveEmailConfirm({ address: ME, email: 'a@b.co', loginEmail: false })).payload, { address: ME });
  assert.match(err(buildJoinNewsletterConfirm({})), /verify an email/);
  assert.match(err(buildUnlinkTelegramConfirm({ address: ME, linked: false })), /not linked/);
});

test('switches refuse a change to what is already so', () => {
  assert.match(err(buildSetMemoryConfirm({ on: true, now: true })), /already on/);
  assert.deepEqual(ok(buildSetMemoryConfirm({ on: false, now: true })).payload, { on: false });
  assert.match(err(buildSetOutsideReadsConfirm({ address: ME, on: false, now: false })), /already cannot/);
  assert.match(err(buildRemovePublishedDealsConfirm({ publishedCount: 0 })), /None of their deals/);
  assert.match(ok(buildRemovePublishedDealsConfirm({ publishedCount: 2 })).summary ?? '', /2 settled deals/);
});

test('feedback, agents and research credit', () => {
  assert.deepEqual(ok(buildSendFeedbackConfirm({ category: 'bug', title: ' Map broke ', message: 'The map did not load.' })).payload, { category: 'bug', title: 'Map broke', message: 'The map did not load.' });
  assert.ok('error' in buildSendFeedbackConfirm({ category: 'bug', title: 'x', message: 'The map did not load.' }));
  assert.match(err(buildSetUpAgentsConfirm({ address: ME, active: true })), /already set up/);
  assert.deepEqual(ok(buildSetUpAgentsConfirm({ address: ME, active: false, buyerName: ' Bee ' })).payload, { address: ME, buyerName: 'Bee' });
  assert.match(err(buildRenameAgentsConfirm({ address: ME, active: true })), /new name/);
  assert.match(err(buildAddResearchCreditConfirm({ active: true, priceUsdc: 1, creditUsdc: 0.5 })), /still have 0\.50/);
  assert.equal(ok(buildAddResearchCreditConfirm({ active: false, priceUsdc: 1, creditUsdc: 0 })).title, 'Add 1.00 USDC of research credit');
});

test('the business workspace, what it trades and the company card', () => {
  assert.match(err(buildCreateBusinessConfirm({ name: 'Ada Foods', hasBusiness: false, open: false })), /not open/);
  assert.match(err(buildCreateBusinessConfirm({ name: 'Ada Foods', hasBusiness: true, open: true })), /already have/);
  assert.deepEqual(ok(buildCreateBusinessConfirm({ name: ' Ada Foods ', hasBusiness: false, open: true })).payload, { name: 'Ada Foods' });
  assert.match(err(buildRenameBusinessConfirm({ workspaceId: 'ws', current: 'Ada Foods', name: 'Ada Foods' })), /already called/);
  assert.deepEqual(ok(buildSaveTradeLineConfirm({ workspaceId: 'ws', tradeType: 'goods', title: 'Rice', unit: 'bag' })).payload, { workspaceId: 'ws', tradeType: 'goods', title: 'Rice', unit: 'bag', active: true });
  assert.match(err(buildEditCompanyCardConfirm({ address: ME, isBusiness: false, patch: { region: 'Lagos' } })), /business accounts/);
  assert.deepEqual(ok(buildEditCompanyCardConfirm({ address: ME, isBusiness: true, patch: { region: 'Lagos', hideFromDiscovery: true } })).payload, { address: ME, smeProfile: { region: 'Lagos', hideFromDiscovery: true } });
});
