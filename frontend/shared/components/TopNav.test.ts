import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the profile control navigates directly to the hub without a dropdown', () => {
  const source = readFileSync(new URL('./TopNav.tsx', import.meta.url), 'utf8');
  const profileLink = source.slice(source.indexOf('function ProfileLink('));
  assert.match(profileLink, /<Link\s+href="\/profile"\s+aria-label=\{t.profile\}/);
  assert.doesNotMatch(profileLink, /aria-expanded|setOpen|data-preferences-dismiss-layer/);
});
