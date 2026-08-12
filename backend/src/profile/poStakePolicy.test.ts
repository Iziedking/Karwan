import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestPOStake } from './poStakePolicy.js';

test('PO protection covers at least 60% of financed principal', () => {
  const suggestion = suggestPOStake('cold', 400);
  assert.equal(suggestion.suggestedBps, 6_000);
  assert.equal(suggestion.suggestedStakeUsdc, '240.00');
});

test('PO protection rounds up and never falls below the 60% floor for any tier', () => {
  for (const tier of ['elite', 'strong', 'established', 'cold', 'new'] as const) {
    const suggestion = suggestPOStake(tier, 101.01);
    assert.ok(suggestion.suggestedBps >= 6_000);
    assert.ok(Number(suggestion.suggestedStakeUsdc) >= 60.606);
  }
});
