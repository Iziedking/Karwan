import test from 'node:test';
import assert from 'node:assert/strict';
import { hubAccountRows, HUB_SETTINGS_ROWS, PROFILE_PAGE_HREF } from './hubRows';

test('anEmailAccountSeesSignInAndSecurityFirst', () => {
  assert.deepEqual(hubAccountRows({ dealsAvailable: true }), ['security', 'reach', 'wallets', 'business']);
});

test('withoutDealsThereIsNoBusinessRow', () => {
  assert.deepEqual(hubAccountRows({ dealsAvailable: false }), ['security', 'reach', 'wallets']);
});

test('settingsAndHelpShareOneCard', () => {
  assert.deepEqual(HUB_SETTINGS_ROWS, ['settings', 'help']);
});

test('eachRowOpensItsOwnPage', () => {
  assert.equal(PROFILE_PAGE_HREF.security, '/profile/security');
  assert.equal(PROFILE_PAGE_HREF.reach, '/profile/contact');
  assert.equal(PROFILE_PAGE_HREF.wallets, '/profile/wallets');
  assert.equal(PROFILE_PAGE_HREF.business, '/profile/business');
  assert.equal(PROFILE_PAGE_HREF.settings, '/settings');
  assert.equal(PROFILE_PAGE_HREF.help, '/profile/help');
});

test('languageThemeAndDevicesAreNotProfileRows', () => {
  const all = [...hubAccountRows({ dealsAvailable: true }), ...HUB_SETTINGS_ROWS] as string[];
  for (const gone of ['language', 'theme', 'devices', 'passkey', 'recovery', 'currency', 'howItWorks']) assert.ok(!all.includes(gone), gone);
});
