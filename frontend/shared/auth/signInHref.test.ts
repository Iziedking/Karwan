import assert from 'node:assert/strict';
import test from 'node:test';
import { signInHref, publicTaskEntry } from './signInHref';
import { safeNext } from './safeNext';

test('protected entry retains selected item, query draft and anchor', () => {
 for (const path of ['/buyer?mode=direct&seller=%40ada&amount=120&terms=Logo#new-deal','/seller?category=design#post-listing','/order/lst_1','/market?side=sell&category=design&q=logo']) {
  const entry = new URL(signInHref(path), 'https://karwan.invalid');
  assert.equal(entry.pathname, '/start');
  assert.equal(entry.searchParams.get('next'), path);
 }
});
test('interrupted About you resumes the intended task without nesting start links', () => {
 assert.equal(signInHref('/start?step=about&next=%2Forder%2Flst_1'),'/start?next=%2Forder%2Flst_1');
 for (const external of ['https://evil.test/start?next=/app','//evil.test/start?next=/app','http://[']) assert.equal(signInHref(external),'/start');
 for (const path of ['/start#tag','/x/../start','/%73tart?next=/app','//evil.test/a','/a/../start/','/START']) assert.equal(safeNext(path),null,path);
});

 test('encoded multilingual search terms fit within the bounded return URL', () => {
  const path='/market?scope=services&q='+encodeURIComponent('خدمة'.repeat(30));
  assert.equal(new URL(signInHref(path),'https://karwan.invalid').searchParams.get('next'),path);
  assert.equal(safeNext('/'+ 'x'.repeat(4096)),null);
 });

 test('public trade entry keeps current filters while generic public entry stays unchanged', () => {
  for (const path of ['/market?scope=services&q=logo','/listings/lst_1','/jobs/job_1']) {
   assert.equal(new URL(publicTaskEntry('/start',path),'https://karwan.invalid').searchParams.get('next'),path);
   assert.equal(new URL(publicTaskEntry('/app',path),'https://karwan.invalid').searchParams.get('next'),path);
  }
  assert.equal(publicTaskEntry('/start','/'),'/start');
  assert.equal(publicTaskEntry('/app','/docs'),'/app');
 });
