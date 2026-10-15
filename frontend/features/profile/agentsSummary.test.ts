import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { en } from '../../shared/i18n/messages/en';

const page = readFileSync(new URL('../../app/profile/page.tsx', import.meta.url), 'utf8');
const panel = page.slice(page.indexOf("key: 'identity'"), page.indexOf("key: 'open-deals'"));

test('the agents summary reads in the same order and words as Edit profile', () => {
  assert.ok(panel.indexOf('profile.seller ?') < panel.indexOf('profile.buyer ?'), 'selling first');
  assert.equal(en.profile.simple.daysRange, '{min} – {max} days');
  assert.equal(en.profile.simple.usdcRange, '{min} – {max} USDC');
  assert.match(page, /const whole = \(value: number\) => value\.toLocaleString\('en-US'\)/);
});

test('nothing on it is cut, the description buyers see is there, and each card edits itself', () => {
  assert.match(panel, /value=\{profile\.seller\.skills[^}]*\}[^/]*full/);
  assert.match(panel, /messages\.profileEdit\.offerDescription/);
  assert.match(page, /href=\{`\/profile\/edit#\$\{anchor\}`\}/);
  assert.match(panel, /action=\{editLink\('selling'\)\}/);
  assert.match(panel, /action=\{editLink\('buying'\)\}/);
  assert.doesNotMatch(panel, /className=\{QUIET_PILL\}>\{simple\.edit\}/);
});

test('"Agents: On" says what it means where it stands', () => {
  assert.match(panel, /<Hint[^>]*>\{simple\.agentsHint\}<\/Hint>/);
  assert.doesNotMatch(page, /hint=\{activeSection === 'identity' \? simple\.agentsHint/);
});
