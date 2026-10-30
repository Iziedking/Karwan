import assert from 'node:assert/strict';
import test from 'node:test';
import { rankFinancingOffers, type RankInput } from './factoringRanking.js';

/// The seller sees financing offers ranked by the financier's reputation, then
/// by price, and the best one marked Recommended (owner, 20 Oct 2026). An
/// offer the financier cannot pay yet is never recommended.
///
///   npx tsx --test src/routes/factoringRanking.test.ts

const offer = (id: string, advance: string, repay: string, tier: RankInput['tier'], funded = true, offeredAt = 0): RankInput => ({
  id, offeredAdvanceUsdc: advance, expectedReturnUsdc: repay, tier, funded, offeredAt,
});

test('reputation first, then the bigger advance', () => {
  const ranked = rankFinancingOffers([
    offer('cheap-new', '900', '1000', 'new'),
    offer('strong-low', '815', '1000', 'strong'),
    offer('strong-high', '880', '1000', 'strong'),
    offer('established', '890', '1000', 'established'),
  ]);
  assert.deepEqual(ranked.map((r) => r.id), ['strong-high', 'strong-low', 'established', 'cheap-new']);
  assert.deepEqual(ranked.map((r) => r.recommended), [true, false, false, false]);
});

test('the same advance goes to whoever asks less back, then whoever offered first', () => {
  const ranked = rankFinancingOffers([
    offer('later', '880', '1000', 'strong', true, 2),
    offer('dearer', '880', '1010', 'strong', true, 1),
    offer('first', '880', '1000', 'strong', true, 1),
  ]);
  assert.deepEqual(ranked.map((r) => r.id), ['first', 'later', 'dearer']);
});

test('an offer the financier cannot pay yet goes last and is never recommended', () => {
  const ranked = rankFinancingOffers([
    offer('elite-unfunded', '950', '1000', 'elite', false),
    offer('cold-funded', '800', '1000', 'cold', true),
  ]);
  assert.deepEqual(ranked.map((r) => [r.id, r.recommended]), [['cold-funded', true], ['elite-unfunded', false]]);
});

test("Karwan's test financier loses a tie to a partner, even when it offered first", () => {
  const house = '0x7E57000000000000000000000000000000007e57';
  const ranked = rankFinancingOffers(
    [
      { ...offer('karwan', '880', '1000', 'strong', true, 1), financier: house.toLowerCase() },
      { ...offer('partner', '880', '1000', 'strong', true, 2), financier: '0xa11' },
    ],
    house,
  );
  assert.deepEqual(ranked.map((r) => [r.id, r.recommended]), [['partner', true], ['karwan', false]]);
});

test("Karwan's test financier is recommended when its offer is the best", () => {
  const house = '0x7e57000000000000000000000000000000007e57';
  const ranked = rankFinancingOffers(
    [
      { ...offer('karwan', '900', '1000', 'strong', true, 2), financier: house },
      { ...offer('partner', '880', '1000', 'strong', true, 1), financier: '0xa11' },
    ],
    house,
  );
  assert.deepEqual(ranked.map((r) => r.id), ['karwan', 'partner']);
});

test('nothing is recommended when no offer can be paid', () => {
  assert.deepEqual(rankFinancingOffers([offer('a', '900', '1000', 'strong', false)]).map((r) => r.recommended), [false]);
});
