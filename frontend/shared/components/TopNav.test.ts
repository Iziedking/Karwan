import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getProfileInitials } from './profileInitials';
import { en } from '../i18n/messages/en';
import { ar } from '../i18n/messages/ar';
import { fr } from '../i18n/messages/fr';
import { hi } from '../i18n/messages/hi';
import { sw } from '../i18n/messages/sw';

const source = readFileSync(new URL('./TopNav.tsx', import.meta.url), 'utf8');
const profileLink = source.slice(source.indexOf('function ProfileLink('), source.indexOf('function SettingsIconLink('));

test('the profile control navigates directly to the hub without a dropdown', () => {
  assert.match(profileLink, /<Link\s+href="\/profile"\s+aria-label=\{label\}/);
  assert.doesNotMatch(profileLink, /aria-expanded|setOpen|data-preferences-dismiss-layer/);
});

test('the profile button is the photo or two initials, with no name, arrow or wallet art', () => {
  assert.doesNotMatch(profileLink, /WalletAvatar/);
  assert.doesNotMatch(profileLink, />\s*\{identityName\}\s*</);
  assert.doesNotMatch(profileLink, /<svg/);
  assert.match(profileLink, /size-10/);
  assert.match(profileLink, /t\.profileOf/);
});

test('initials come from the name, then the address', () => {
  assert.equal(getProfileInitials('Kingizie', null), 'KI');
  assert.equal(getProfileInitials('Ada Obi', null), 'AO');
  assert.equal(getProfileInitials('', '0xab12cd'), 'AB');
  assert.equal(getProfileInitials('', null), 'KW');
});

test("the button's label names Profile in every language, so it is found by that word", () => {
  for (const m of [en, ar, fr, hi, sw]) {
    assert.ok(m.nav.profileOf.toLowerCase().includes(m.nav.profile.toLowerCase()), m.nav.profileOf);
  }
});
