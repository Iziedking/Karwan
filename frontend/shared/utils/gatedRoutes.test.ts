import assert from 'node:assert/strict';
import test from 'node:test';
import { GATED_ROUTES, gatedRouteOpen } from './gatedRoutes';

/// A page behind an off switch is a plain 404, never a half-working screen
/// (product audit, Batch 1).
///
///   npx tsx --test shared/utils/gatedRoutes.test.ts

test('the PO line page opens only when PO financing is on', () => {
  assert.equal(gatedRouteOpen('/financier/po', { poFinancing: false }), false);
  assert.equal(gatedRouteOpen('/financier/po', { poFinancing: true }), true);
});

test('business verification is never gated: existing business accounts manage it while new ones are closed', () => {
  assert.deepEqual(GATED_ROUTES, ['/financier/po']);
});
