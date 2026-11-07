import assert from 'node:assert/strict';
import test from 'node:test';
import { draftDeal, partsAgreement, repairParts, ruleParts } from './drafter.js';

/// Say it, and the deal is drafted (view 56): rules first, the model only for
/// nuance, the contract rules decide, and it never blocks.

const sum = (parts: { pct: number }[]) => parts.reduce((s, p) => s + p.pct, 0);

test('plain work is one payment whose delivery is the brief', () => {
  const parts = ruleParts('A logo for my bakery');
  assert.deepEqual(parts, [{ pct: 100, what: 'A logo for my bakery' }]);
});

test('"first ... then" becomes two parts, the first smaller', () => {
  const parts = ruleParts("Six aso-ebi outfits for my sister's wedding. Measurements first, then sewing.");
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((p) => p.pct), [30, 70]);
  assert.match(parts[0]!.what, /measurements/i);
  assert.match(parts[1]!.what, /sewing/i);
});

test('three stages split 20, 30, 50', () => {
  const parts = ruleParts('First three sketches, then the chosen design refined, then final files');
  assert.deepEqual(parts.map((p) => p.pct), [20, 30, 50]);
  assert.equal(parts[2]!.what, 'Final files');
});

test('half up front is a first part of 50', () => {
  const parts = ruleParts('Pay half up front, the rest on delivery. Website for my shop');
  assert.deepEqual(parts.map((p) => p.pct), [50, 50]);
});

test('a percentage up front is used as said', () => {
  const parts = ruleParts('30% deposit then the rest when the sofa is delivered');
  assert.deepEqual(parts.map((p) => p.pct), [30, 70]);
});

test('repair keeps 1 to 5 parts that add to 100, each saying what it delivers', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ pct: 10, what: `Part ${i + 1}` }));
  const r = repairParts(six, 'brief');
  assert.equal(r.length, 5);
  assert.equal(sum(r), 100);
  assert.deepEqual(repairParts([{ pct: 0, what: '' }], 'The brief'), [{ pct: 100, what: 'The brief' }]);
  const odd = repairParts([{ pct: 33, what: 'a' }, { pct: 33, what: 'b' }, { pct: 33, what: 'c' }], 'x');
  assert.equal(sum(odd), 100);
  assert.ok(odd.every((p) => p.pct >= 1 && Number.isInteger(p.pct)));
});

test('the model is asked only when the rules found one part in a long brief, and its answer is repaired', async () => {
  let asked = 0;
  const long = 'Build an online store for my fabric shop with product pages, payments by card and bank transfer, and a page to track orders.';
  const d = await draftDeal({ brief: long }, { split: async () => { asked += 1; return [{ pct: 40, what: 'Store and product pages' }, { pct: 40, what: 'Payments working' }, { pct: 40, what: 'Order tracking' }]; } });
  assert.equal(asked, 1);
  assert.equal(d.source, 'model');
  assert.equal(sum(d.parts), 100);
  assert.equal(d.parts.length, 3);
  await draftDeal({ brief: 'A logo' }, { split: async () => { asked += 1; return null; } });
  await draftDeal({ brief: 'Measurements first, then sewing' }, { split: async () => { asked += 1; return null; } });
  assert.equal(asked, 1);
});

test('a slow or failing model never blocks: one part, at once', async () => {
  const long = 'Build an online store for my fabric shop with product pages, payments by card and bank transfer, and a page to track orders.';
  const failed = await draftDeal({ brief: long }, { split: async () => { throw new Error('down'); } });
  assert.equal(failed.source, 'rules');
  assert.deepEqual(failed.parts.map((p) => p.pct), [100]);
  const slow = await draftDeal({ brief: long }, { split: () => new Promise((r) => setTimeout(() => r([{ pct: 50, what: 'a' }, { pct: 50, what: 'b' }]), 500)), timeoutMs: 50 });
  assert.equal(slow.source, 'rules');
});

test('goods and a count are read from the words', async () => {
  const d = await draftDeal({ brief: '3 bags of rice delivered to Ikeja' }, {});
  assert.equal(d.tradeType, 'goods');
  assert.deepEqual(d.quantity, { count: 3, unit: 'bags' });
  const s = await draftDeal({ brief: 'A logo for my bakery' }, {});
  assert.equal(s.tradeType, 'service');
});

test('the title is the brief, short', async () => {
  const d = await draftDeal({ brief: "Six aso-ebi outfits for my sister's wedding. Measurements first, then sewing." }, {});
  assert.equal(d.title, "Six aso-ebi outfits for my sister's wedding");
});

test('the agreement for drafted parts names every milestone, the proof and the time to check', () => {
  const text = partsAgreement([{ pct: 30, what: 'Sketches' }, { pct: 70, what: 'Final files' }], { due: true });
  assert.match(text, /released in 2 milestones:/);
  assert.match(text, /• Milestone 1, 30%: Sketches\n• Milestone 2, 70%: Final files/);
  assert.match(text, /Time to check: 3 days/);
  assert.match(text, /^Late:/m);
  assert.doesNotMatch(partsAgreement([{ pct: 50, what: 'a' }, { pct: 50, what: 'b' }], { due: false }), /^Late:/m);
});

test('goods for sale are one payment: the model is never asked to find stages in a used laptop (Telegram, 7 Nov)', async () => {
  let asked = 0;
  const split = async () => (asked++, [{ pct: 25, what: 'HP Envy laptop' }, { pct: 75, what: 'Laptop in excellent condition' }]);
  const brief = 'HP Envy Core i5 Laptop. HP Envy Core i5, 32 GB RAM, 1TB SSD, 8GB VRAM, keyboard light. Lightly used, in excellent condition. Includes charger. Ships with tracking.';
  const d = await draftDeal({ brief }, { split });
  assert.equal(d.tradeType, 'goods');
  assert.equal(d.parts.length, 1);
  assert.equal(asked, 0);
  const said = await draftDeal({ brief: 'Two mattresses, queen size, still wrapped in plastic, collected from Yaba on Saturday morning.', goods: true }, { split });
  assert.equal(said.parts.length, 1);
  assert.equal(asked, 0);
  const deposit = await draftDeal({ brief: '50% deposit first, rest when the fridge is delivered to Lekki', goods: true }, { split });
  assert.deepEqual(deposit.parts.map((p) => p.pct), [50, 50]);
});
