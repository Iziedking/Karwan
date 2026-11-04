import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CLIP_CAPS, TRADE_CLIPS, clipFiles } from './tradeClips';

const PUBLIC = path.join(__dirname, '..', '..', 'public');

test('the six kinds of trade each name a clip, in the drawn order', () => {
  assert.deepEqual(TRADE_CLIPS.map((clip) => clip.key), ['tailor', 'market', 'developer', 'designer', 'seller', 'finance']);
  assert.equal(new Set(TRADE_CLIPS.map((clip) => clip.pexelsId)).size, 6);
});

test('every clip file the page names exists and stays under its size cap', () => {
  for (const clip of TRADE_CLIPS) {
    const files = clipFiles(clip.key);
    for (const [kind, href] of Object.entries(files) as [keyof typeof CLIP_CAPS, string][]) {
      const file = path.join(PUBLIC, href);
      assert.ok(existsSync(file), `${href} is missing`);
      const size = statSync(file).size;
      assert.ok(size <= CLIP_CAPS[kind], `${href} is ${size} bytes, over ${CLIP_CAPS[kind]}`);
    }
  }
});

test('the sources note names every clip by its Pexels id and the licence', () => {
  const note = readFileSync(path.join(PUBLIC, 'media', 'landing', 'trades', 'SOURCES.md'), 'utf8');
  for (const clip of TRADE_CLIPS) assert.match(note, new RegExp(`pexels\\.com/video/${clip.pexelsId}/`));
  assert.match(note, /pexels\.com\/license/);
  assert.match(note, /never as customers/);
});
