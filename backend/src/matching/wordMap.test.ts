import assert from 'node:assert/strict';
import test from 'node:test';
import { WORD_GROUPS, mapHits } from './wordMap.js';

/// The word map (view 95): names people use for the same work, found in any tag.
///
///   npx tsx --test src/matching/wordMap.test.ts

const groups = (tags: string[]) => [...mapHits(tags).groups].sort();

test('a fashion designer is tailoring, and both words are what hit it', () => {
  const hits = mapHits(['fashion designer']);
  assert.deepEqual([...hits.groups], ['tailoring']);
  assert.deepEqual([...(hits.words.get('tailoring') ?? [])].sort(), ['designer', 'fashion']);
});

test('tailor in a longer tag, and its usual endings', () => {
  assert.deepEqual(groups(['Tailor, native and English wears']), ['tailoring']);
  assert.deepEqual(groups(['tailoring']), ['tailoring']);
  assert.deepEqual(groups(['tailors']), ['tailoring']);
});

test('designer alone opens nothing, graphic designer opens only graphic design', () => {
  assert.deepEqual(groups(['designer']), []);
  assert.deepEqual(groups(['graphic designer']), ['graphic-design']);
});

test('video alone opens nothing; a video editor is video editing', () => {
  assert.deepEqual(groups(['video']), []);
  assert.deepEqual(groups(['video editor']), ['video-editing']);
});

test('the longest name wins where names overlap', () => {
  assert.deepEqual(groups(['dry cleaner']), ['laundry']);
  assert.deepEqual(groups(['generator mechanic']), ['generator-repair']);
});

test('no group from part of a word or an unlisted ending', () => {
  assert.deepEqual(groups(['smart art']), []);
  assert.deepEqual(groups(['a website tutorial']), ['websites']);
});

test('a phrase is found inside a whole sentence', () => {
  assert.deepEqual(groups(['I need someone to sew my wedding gown, a good fashion designer']), ['tailoring']);
});

test('short names count as whole words', () => {
  assert.deepEqual(groups(['DJ for my party']), ['music']);
  assert.deepEqual(groups(['AC repair in Lekki']), ['cooling']);
  assert.deepEqual(groups(['adjust']), []);
});

test('names in Arabic, Hindi, Hausa and Swahili hit their group', () => {
  assert.deepEqual(groups(['خياط']), ['tailoring']);
  assert.deepEqual(groups(['दर्ज़ी']), ['tailoring']);
  assert.deepEqual(groups(['tela a Kano']), ['tailoring']);
  assert.deepEqual(groups(['fundi cherehani']), ['tailoring']);
});

test('filler and empty input open nothing', () => {
  assert.deepEqual(groups(['service account']), []);
  assert.deepEqual(groups([]), []);
  assert.deepEqual(groups(['']), []);
});

test('the map is well formed', () => {
  const ids = new Set<string>();
  const seen = new Map<string, string>();
  for (const g of WORD_GROUPS) {
    assert.match(g.id, /^[a-z]+(-[a-z]+)*$/, `${g.id} is kebab-case`);
    assert.ok(!ids.has(g.id), `${g.id} is unique`);
    ids.add(g.id);
    assert.ok(g.names.length > 0, `${g.id} has names`);
    for (const n of g.names) {
      assert.equal(n.text, n.text.normalize('NFC').toLowerCase(), `${n.text} is lower case`);
      const other = seen.get(n.text);
      assert.ok(!other, `${n.text} is in ${other} and ${g.id}`);
      seen.set(n.text, g.id);
    }
  }
  assert.ok(WORD_GROUPS.length >= 35);
});

test('one-word tags in a row read as the text they came from, as find passes them', () => {
  assert.deepEqual(groups(['fashion', 'designer', 'for', 'clothes']), ['tailoring']);
  assert.deepEqual([...(mapHits(['fashion', 'designer']).words.get('tailoring') ?? [])].sort(), ['designer', 'fashion']);
});

test('tags of several words never join their neighbours into a phrase', () => {
  assert.deepEqual(groups(['brand fashion', 'designer logos']), []);
});
