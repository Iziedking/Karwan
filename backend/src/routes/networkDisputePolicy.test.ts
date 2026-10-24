import assert from 'node:assert/strict';
import { test } from 'node:test';

/// The deal forms write the review clause from this policy, so a deal's terms
/// say what happens when the buyer is silent on the escrow that will hold it.
///
///   npx tsx --test src/routes/networkDisputePolicy.test.ts

delete process.env.DATABASE_URL;
for (const k of Object.keys(process.env)) if (k.startsWith('KARWAN_SUITE_')) delete process.env[k];

const { networkRoutes } = await import('./network.js');

test('silence_pays_the_seller_while_new_deals_stay_on_the_current_escrow', async () => {
  const res = await networkRoutes.request('/dispute-policy');
  assert.equal(res.status, 200);
  const body = (await res.json()) as { buyerSilence?: string };
  assert.equal(body.buyerSilence, 'pays_seller');
});
