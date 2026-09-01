import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveDeckSwipe } from './ProfileDeck';

test('a deliberate horizontal swipe advances one profile section', () => {
  assert.equal(resolveDeckSwipe(-72, 8), 'next');
  assert.equal(resolveDeckSwipe(72, 8), 'previous');
});

test('short movement does not change profile sections', () => {
  assert.equal(resolveDeckSwipe(-55, 0), null);
  assert.equal(resolveDeckSwipe(55, 0), null);
});

test('vertical and diagonal scrolling never pages the profile deck', () => {
  assert.equal(resolveDeckSwipe(-80, 72), null);
  assert.equal(resolveDeckSwipe(64, 56), null);
  assert.equal(resolveDeckSwipe(12, 120), null);
});

test('mobile profile cards leave vertical scrolling to the document', () => {
  const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
  const mobileDeckStart = css.indexOf('@media (max-width: 767px) {\n  .profile-deck-card');
  const nextSection = css.indexOf('/* RainbowKit account modal', mobileDeckStart);
  const mobileDeckCss = css.slice(mobileDeckStart, nextSection);

  assert.ok(mobileDeckStart >= 0, 'mobile profile deck rule is missing');
  assert.match(mobileDeckCss, /max-height:\s*none/);
  assert.match(mobileDeckCss, /overflow-x:\s*clip/);
  assert.match(mobileDeckCss, /overflow-y:\s*visible/);
  assert.match(mobileDeckCss, /overscroll-behavior:\s*auto/);
});
