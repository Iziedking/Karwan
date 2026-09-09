import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { CAPABILITIES, CAPABILITY_COPY, canRotateStory, STORY_INTERVAL_MS } from './capabilityStory';

test('every capability has a real product destination and complete localized copy', () => {
  assert.equal(CAPABILITIES.length, 5);
  for (const copy of Object.values(CAPABILITY_COPY)) {
    assert.deepEqual(Object.keys(copy.scenes), CAPABILITIES.map((item) => item.id));
    for (const scene of CAPABILITIES) {
      for (const text of Object.values(copy.scenes[scene.id])) assert.ok(text.trim().length > 0);
      assert.ok(existsSync(new URL(`../../app${scene.href}/page.tsx`, import.meta.url)), scene.href);
    }
  }
  assert.deepEqual(Object.keys(CAPABILITY_COPY).sort(), ['ar', 'en', 'fr', 'hi', 'sw']);
});

test('animation refuses to rotate during each interruption and reduced motion', () => {
  const active = { paused: false, reduced: false, hovered: false, visible: true, inView: true };
  assert.equal(canRotateStory(active), true);
  for (const key of ['paused', 'reduced', 'hovered'] as const) assert.equal(canRotateStory({ ...active, [key]: true }), false);
  for (const key of ['visible', 'inView'] as const) assert.equal(canRotateStory({ ...active, [key]: false }), false);
  assert.ok(STORY_INTERVAL_MS >= 6000);
});

test('the story distinguishes test settlement and current Karwan records', () => {
  const copy = CAPABILITY_COPY.en.scenes;
  assert.match(copy.settlement.body, /test USDC/);
  assert.match(copy.reputation.body, /completed Karwan trades/);
  assert.doesNotMatch(copy.reputation.body, /Upwork|Fiverr|planned import/i);
  assert.match(copy.research.body, /available evidence/);
  assert.doesNotMatch(JSON.stringify(copy), /zero fees|guaranteed|instant|verified on every platform|—/i);
});

test('social marks use published assets instead of text approximations', () => {
  const tiktok = readFileSync(new URL('../../public/brand/social/TikTok_Icon_Black_Square.png', import.meta.url));
  assert.equal(tiktok.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const instagram = readFileSync(new URL('../../public/brand/social/instagram-color.svg', import.meta.url), 'utf8');
  assert.match(instagram, /viewBox="0 0 24 24"/);
  assert.match(instagram, /linearGradient/);
  assert.match(instagram, /<rect/);
  assert.doesNotMatch(instagram, /<script|<text|◎/);
  for (const id of ['facebook', 'x', 'linkedin']) {
    const source = readFileSync(new URL(`../../public/brand/social/${id}.svg`, import.meta.url), 'utf8');
    assert.match(source, /viewBox="0 0 24 24"/);
    assert.match(source, /<path/);
    assert.doesNotMatch(source, /<script|<text|◎/);
  }
});
