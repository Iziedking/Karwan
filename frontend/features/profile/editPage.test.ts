import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../app/profile/edit/page.tsx', import.meta.url), 'utf8');

test('edit profile is titled for what it does and grouped like Profile', () => {
  assert.match(page, /<ProfileFrame title=\{t\.hub\.editProfile\}>/);
  assert.equal(page.match(/<FormCard /g)?.length, 3);
  assert.match(page, /<RangeField/);
});

test('Save never greys out without a reason, and a failed save speaks plainly', () => {
  assert.match(page, /editBlockers\(/);
  assert.match(page, /<Need when=\{blocked\('[a-zA-Z]+'\)\}/);
  assert.doesNotMatch(page, /JSON\.stringify/);
  assert.match(page, /setError\(pe\.saveFailed\)/);
});

test('Save stays in reach on a phone, above the bottom bar', () => {
  assert.match(page, /data-sticky-save[^>]*sticky/);
});
