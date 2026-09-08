import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../app/onboarding/page.tsx', import.meta.url), 'utf8');
test('onboarding offers agent activation only after profile save and keeps it optional', () => {
  assert.ok(page.indexOf("setStep('getReady')") > page.indexOf('await api.saveProfile('));
  assert.match(page, /function GetReadyStep/);
  assert.match(page, /useActivation\(\)/);
  assert.match(page, /await activate\(\);\s+onDone\(\);/);
  assert.match(page, /onClick=\{onDone\}/);
  assert.match(page, /\{t\.skip\}/);
  assert.doesNotMatch(page, /api\.(deposit|transfer|withdraw)\(/);
  assert.match(page, /onDone=\{\(\) => router.push\('\/app'\)\}/);
});
test('failed profile reads block setup and save requests are guarded', () => {
  assert.match(page, /setProfileLoadFailed\(true\)/);
  assert.match(page, /if \(profileLoadFailed\)/);
  assert.match(page, /profileLoadFailed \|\| submittingRef.current/);
});
