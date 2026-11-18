import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENE_MONEY, dealScenes, type DealSceneId } from './dealScenes';

const SCENES: DealSceneId[] = ['open-market', 'direct', 'contest', 'hourly', 'agent-match', 'standing-order', 'pay-link', 'release'];
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const allText = (c: (typeof dealScenes)['en']['direct']) => [c.title, c.pill ?? '', ...c.rows.flatMap((r) => [r.label, r.value ?? '', r.pill ?? '']), c.done.label, c.done.pill];

test('every language draws every scene with the same rows and the same money', () => {
  for (const lang of Object.keys(dealScenes) as Array<keyof typeof dealScenes>) {
    for (const id of SCENES) {
      const en = dealScenes.en[id];
      const here = dealScenes[lang][id];
      assert.ok(here, `${lang} ${id}`);
      assert.equal(here.rows.length, en.rows.length, `${lang} ${id} rows`);
      assert.deepEqual(holes(allText(here).join(' ')), holes(allText(en).join(' ')), `${lang} ${id} amounts`);
      for (const line of allText(here)) assert.doesNotMatch(line, /—/, `${lang} ${id}: no em dash`);
    }
  }
});

test('every amount a scene names has a figure', () => {
  for (const id of SCENES) {
    for (const key of holes(allText(dealScenes.en[id]).join(' '))) {
      assert.equal(typeof SCENE_MONEY[id][key], 'number', `${id} {${key}}`);
    }
  }
});
