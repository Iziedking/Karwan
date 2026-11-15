import assert from 'node:assert/strict';
import test from 'node:test';
import { afterNotNow, afterQuietHere, emptyVisit, guideFrom, hiddenNow, isQuiet, readVisit, VISIT_KEY, writeVisit } from './guideChoices';

function fakeStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    data,
  };
}

test('one Not now hides the line on that page only', () => {
  const v = afterNotNow(emptyVisit(), '/market');
  assert.equal(hiddenNow(v, '/market', false), true);
  assert.equal(hiddenNow(v, '/app', false), false);
  assert.equal(isQuiet(v, '/market'), false);
});

test('two Not now on one page keep it quiet there for the visit', () => {
  const v = afterNotNow(afterNotNow(emptyVisit(), '/market'), '/market');
  assert.equal(isQuiet(v, '/market'), true);
  assert.equal(isQuiet(v, '/app'), false);
});

test('Not on this page is quiet at once', () => {
  const v = afterQuietHere(emptyVisit(), '/deals/0xd1');
  assert.equal(isQuiet(v, '/deals/0xd1'), true);
  assert.equal(hiddenNow(v, '/deals/0xd1', false), true);
});

test('one line a page: once spoken, it stays down', () => {
  assert.equal(hiddenNow(emptyVisit(), '/app', true), true);
  assert.equal(hiddenNow(emptyVisit(), '/app', false), false);
});

test('a page with a trailing slash is the same page', () => {
  assert.equal(isQuiet(afterQuietHere(emptyVisit(), '/market/'), '/market'), true);
});

test('no setting means the guide is on', () => {
  assert.equal(guideFrom(undefined), 'on');
  assert.equal(guideFrom(null), 'on');
  assert.equal(guideFrom({}), 'on');
  assert.equal(guideFrom({ guide: 'face' }), 'face');
  assert.equal(guideFrom({ guide: 'off' }), 'off');
  assert.equal(guideFrom({ guide: 'loud' as never }), 'on');
});

test('a reload in the same visit keeps Not now', () => {
  const store = fakeStore();
  writeVisit(store, afterNotNow(emptyVisit(), '/market'));
  assert.ok(store.data.has(VISIT_KEY));
  assert.equal(hiddenNow(readVisit(store), '/market', false), true);
});

test('blocked or broken storage gives an empty visit', () => {
  const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(readVisit(throwing), emptyVisit());
  assert.doesNotThrow(() => writeVisit(throwing, emptyVisit()));
  const store = fakeStore();
  store.setItem(VISIT_KEY, '{not json');
  assert.deepEqual(readVisit(store), emptyVisit());
  store.setItem(VISIT_KEY, JSON.stringify({ notNow: 'x', quiet: 4 }));
  assert.deepEqual(readVisit(store), emptyVisit());
});
